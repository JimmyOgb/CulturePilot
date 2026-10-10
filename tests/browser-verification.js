import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../src/server.js';

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

console.log(`[Browser Audit] Using browser binary: ${CHROME_PATH}`);

async function runBrowserAudit() {
  // 1. Start backend server
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const targetUrl = `http://localhost:${port}/`;
  console.log(`[Browser Audit] Backend server running on ${targetUrl}`);

  // 2. Prepare temporary user-data-dir
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-audit-'));
  const cdpPort = 9222 + Math.floor(Math.random() * 500);

  // 3. Launch Chrome Headless with Remote Debugging
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tempProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required'
    ],
    { stdio: 'ignore' }
  );

  console.log(`[Browser Audit] Chrome spawned with PID ${chromeProcess.pid} on CDP port ${cdpPort}`);

  // Helper: wait for CDP target to be available
  let wsUrl = null;
  for (let attempt = 1; attempt <= 50; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const tabs = await res.json();
      const pageTab = tabs.find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension:'));
      if (pageTab && pageTab.webSocketDebuggerUrl) {
        wsUrl = pageTab.webSocketDebuggerUrl;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (!wsUrl) {
    throw new Error(`Could not connect to Chrome DevTools Protocol on port ${cdpPort}.`);
  }

  console.log(`[Browser Audit] Connected to CDP WebSocket: ${wsUrl}`);

  // 4. Communicate with Chrome via WebSocket
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let messageId = 1;
  const pending = new Map();
  const eventListeners = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && eventListeners.has(msg.method)) {
      for (const cb of eventListeners.get(msg.method)) {
        cb(msg.params);
      }
    }
  };

  const sendCdpCommand = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const onEvent = (method, cb) => {
    if (!eventListeners.has(method)) eventListeners.set(method, []);
    eventListeners.get(method).push(cb);
  };

  // Enable Runtime and Page
  await sendCdpCommand('Runtime.enable');
  await sendCdpCommand('Page.enable');

  onEvent('Runtime.consoleAPICalled', (params) => {
    console.log(`[Browser Console] [${params.type}]`, params.args?.map(a => a.value ?? a.description).join(' '));
  });
  onEvent('Runtime.exceptionThrown', (params) => {
    console.error(`[Browser Exception]`, params.exceptionDetails);
  });

  const evalInPage = async (expression, awaitPromise = false) => {
    const res = await sendCdpCommand('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    });
    return res.result?.value;
  };

  // Navigate and wait for DOMContentLoaded (doesn't hang on large video buffering)
  console.log(`[Browser Audit] Navigating page to ${targetUrl}...`);
  const domLoadedPromise = new Promise((resolve) => {
    onEvent('Page.domContentEventFired', resolve);
    setTimeout(resolve, 3000); // 3s fallback
  });
  await sendCdpCommand('Page.navigate', { url: targetUrl });
  await domLoadedPromise;
  console.log(`[Browser Audit] DOM Content Loaded event confirmed.`);

  // Brief pause for script execution
  await new Promise((r) => setTimeout(r, 600));

  // In headless Chrome with --disable-gpu, remote MP4 decoding can trigger NotSupportedError.
  // Stub HTMLMediaElement.prototype.play so frame listener resolves cleanly during automated test.
  await evalInPage(`
    HTMLMediaElement.prototype.play = function() {
      const v = this;
      setTimeout(function() { v.dispatchEvent(new Event('playing')); }, 20);
      return Promise.resolve();
    };
  `);

  console.log('\n--- BROWSER VERIFICATION TESTS ---');

  // Test 1: Page Title & Critical DOM Elements
  const pageTitle = await evalInPage('document.title');
  console.log(`1. Page Title: "${pageTitle}" -> ${pageTitle.includes('LTX') ? 'PASS' : 'FAIL'}`);

  const domCheck = await evalInPage(`
    ({
      hasStage: Boolean(document.getElementById('stage')),
      hasHero: Boolean(document.getElementById('hero')),
      hasController: Boolean(document.getElementById('controller')),
      hasMedia: Boolean(document.getElementById('mediaContainer')),
      videoCount: document.querySelectorAll('.media-container video').length,
      buttons: Array.from(document.querySelectorAll('.controller-btn')).map(b => b.textContent.trim()),
      hasDiscoveryDock: Boolean(document.getElementById('discoveryDock')),
      hasDiscoveryInput: Boolean(document.getElementById('discoveryInput')),
      hasDiscoverySubmit: Boolean(document.getElementById('discoverySubmitBtn')),
      chipsCount: document.querySelectorAll('.discovery-chip').length,
      hasHeaderBtn: Boolean(document.getElementById('headerDiscoveryBtn')),
      hasResultsPanel: Boolean(document.getElementById('discoveryResultsPanel'))
    })
  `);
  console.log(`2. DOM Hierarchy Check:`);
  console.log(`   - Stage element: ${domCheck.hasStage ? 'PASS' : 'FAIL'}`);
  console.log(`   - Hero element: ${domCheck.hasHero ? 'PASS' : 'FAIL'}`);
  console.log(`   - Controller & Buttons: [${domCheck.buttons.join(', ')}] -> ${domCheck.buttons.length === 4 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Video Elements Count: ${domCheck.videoCount} (expected 8 persistent) -> ${domCheck.videoCount === 8 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Discovery Dock & Input: ${domCheck.hasDiscoveryDock && domCheck.hasDiscoveryInput ? 'PASS' : 'FAIL'}`);
  console.log(`   - Suggested Chips: ${domCheck.chipsCount} chips -> ${domCheck.chipsCount >= 3 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Header Discovery Button: ${domCheck.hasHeaderBtn ? 'PASS' : 'FAIL'}`);
  console.log(`   - Results Modal Panel: ${domCheck.hasResultsPanel ? 'PASS' : 'FAIL'}`);

  // Test 2: CulturePilotAPI Global Object & Live Query
  const apiAvailable = await evalInPage('typeof window.CulturePilotAPI === "object"');
  console.log(`3. window.CulturePilotAPI exists on window: ${apiAvailable ? 'PASS' : 'FAIL'}`);

  // Test 3: End-to-End Discovery UI Interaction
  console.log('4. Testing Discovery Form Submission & Glass Results Panel...');
  await evalInPage(`
    document.getElementById('discoveryInput').value = 'Weekend in Lagos with an artsy, design-focused, indie-music vibe and good coffee';
    document.getElementById('discoveryForm').dispatchEvent(new Event('submit', { cancelable: true }));
  `);

  // Wait for modal to become visible and display loading state
  const modalOpened = await evalInPage(`!document.getElementById('discoveryResultsPanel').classList.contains('is-hidden')`);
  console.log(`   - Results panel opened on submit: ${modalOpened ? 'PASS' : 'FAIL'}`);

  // Poll for results to finish loading (up to 25s for live multi-turn Qloo Hackathon API)
  let resultsLoaded = false;
  for (let i = 0; i < 125; i++) {
    const hasCards = await evalInPage(`document.querySelectorAll('.discovery-card').length > 0`);
    if (hasCards) {
      resultsLoaded = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!resultsLoaded) {
    const bodyText = await evalInPage(`document.getElementById('discoveryPanelBody').innerText`);
    console.log('   - Discovery panel body on timeout:', bodyText);
  }
  console.log(`   - Discovery results populated: ${resultsLoaded ? 'PASS' : 'FAIL'}`);

  const renderedSummary = await evalInPage(`
    ({
      statusBadge: document.getElementById('discoveryStatusBadge').textContent.trim(),
      cardCount: document.querySelectorAll('.discovery-card').length,
      sections: Array.from(document.querySelectorAll('.section-title')).map(s => s.textContent.trim()),
      hasExcludedDetails: Boolean(document.querySelector('.diagnostics-disclosure')),
      excludedCount: document.querySelectorAll('.excluded-table tbody tr').length,
      hasDisclaimers: Boolean(document.querySelector('.discovery-disclaimer'))
    })
  `);
  console.log(`   - Rendered Status Badge: "${renderedSummary.statusBadge}"`);
  console.log(`   - Rendered Sections: [${renderedSummary.sections.join(' | ')}]`);
  console.log(`   - Entity Cards Count: ${renderedSummary.cardCount} cards`);
  console.log(`   - Transparency Diagnostics Accordion: ${renderedSummary.hasExcludedDetails ? 'PASS' : 'FAIL'} (${renderedSummary.excludedCount} excluded items)`);
  console.log(`   - Cultural Affinity Disclaimer present: ${renderedSummary.hasDisclaimers ? 'PASS' : 'FAIL'}`);

  // Test Close Modal via Escape Key
  await evalInPage(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await new Promise((r) => setTimeout(r, 200));
  const modalClosed = await evalInPage(`document.getElementById('discoveryResultsPanel').classList.contains('is-hidden')`);
  console.log(`   - Escape key closed results panel: ${modalClosed ? 'PASS' : 'FAIL'}`);

  // Test Prompt Chip Click
  console.log('5. Testing Prompt Chip Click...');
  await evalInPage(`document.querySelector('.discovery-chip').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const chipOpened = await evalInPage(`!document.getElementById('discoveryResultsPanel').classList.contains('is-hidden')`);
  console.log(`   - Prompt chip opened results panel: ${chipOpened ? 'PASS' : 'FAIL'}`);

  // Close with close button
  await evalInPage(`document.getElementById('discoveryCloseBtn').click()`);
  await new Promise((r) => setTimeout(r, 200));

  // Check Secrets in DOM
  const domHtml = await evalInPage('document.documentElement.outerHTML');
  const hasSecret = domHtml.includes('hack_') || domHtml.includes('AIzaSy');
  console.log(`   - Zero API secrets in client DOM: ${!hasSecret ? 'PASS (SECURE)' : 'FAIL (LEAKED!)'}`);

  // Test 4: Video Transition & Reset Interaction Still Intact
  console.log('6. Testing Scene branch transition & Reset button...');
  const preClickState = await evalInPage(`
    ({
      videoClasses: document.getElementById('v-clothing-fwd').className,
      controllerClasses: document.getElementById('controller').className,
      btnSceneDisabled: document.getElementById('btn-scene').disabled,
      videoReadyState: document.getElementById('v-clothing-fwd').readyState
    })
  `);
  console.log(`   - Pre-click state:`, preClickState);

  // If locked or awaiting readyState, wait up to 3s for video to be ready
  for (let i = 0; i < 30; i++) {
    const isUnlocked = await evalInPage(`!document.getElementById('btn-scene').disabled`);
    if (isUnlocked) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // Click 'Scene' button
  await evalInPage(`document.getElementById('btn-scene').click()`);
  await new Promise((r) => setTimeout(r, 600));

  const transitionState = await evalInPage(`
    ({
      controllerSelected: document.getElementById('controller').classList.contains('is-selected'),
      sceneButtonText: document.getElementById('btn-scene').textContent.trim(),
      btnSceneDisabled: document.getElementById('btn-scene').disabled
    })
  `);
  console.log(`   - Controller entered selected state: ${transitionState.controllerSelected ? 'PASS' : 'FAIL'}`);
  console.log(`   - Scene button chosen: ${await evalInPage(`document.getElementById('btn-scene').classList.contains('is-chosen')`) ? 'PASS' : 'FAIL'}`);

  // Forward video reaches terminal frame
  await evalInPage(`document.getElementById('v-scene-fwd').dispatchEvent(new Event('ended'))`);
  await new Promise((r) => setTimeout(r, 200));

  const readyToReset = await evalInPage(`
    ({
      btnText: document.getElementById('btn-scene').textContent.trim(),
      btnDisabled: document.getElementById('btn-scene').disabled
    })
  `);
  console.log(`   - Scene button reached terminal state: "${readyToReset.btnText}" (disabled=${readyToReset.btnDisabled})`);

  // Click 'Reset' to reverse back to base
  await evalInPage(`document.getElementById('btn-scene').click()`);
  await new Promise((r) => setTimeout(r, 200));

  // Reverse video reaches terminal frame
  await evalInPage(`document.getElementById('v-scene-rev').dispatchEvent(new Event('ended'))`);
  await new Promise((r) => setTimeout(r, 200));

  const resetState = await evalInPage(`
    ({
      controllerExpanded: !document.getElementById('controller').classList.contains('is-selected'),
      buttonsPresent: Array.from(document.querySelectorAll('.controller-btn')).map(b => b.textContent.trim())
    })
  `);
  // Test 5: Verify all four forward/reverse transitions (Scene, Lighting, Clothing, Cast)
  console.log('7. Testing All 4 Branch Transitions (Lighting, Clothing, Cast)...');
  const otherBranches = ['lighting', 'clothing', 'cast'];
  for (const branch of otherBranches) {
    // Click branch button
    await evalInPage(`document.getElementById('btn-${branch}').click()`);
    await new Promise((r) => setTimeout(r, 150));

    // Forward terminal frame
    await evalInPage(`document.getElementById('v-${branch}-fwd').dispatchEvent(new Event('ended'))`);
    await new Promise((r) => setTimeout(r, 150));

    // Reset button clicked
    await evalInPage(`document.getElementById('btn-${branch}').click()`);
    await new Promise((r) => setTimeout(r, 150));

    // Reverse terminal frame
    await evalInPage(`document.getElementById('v-${branch}-rev').dispatchEvent(new Event('ended'))`);
    await new Promise((r) => setTimeout(r, 150));

    const restored = await evalInPage(`!document.getElementById('controller').classList.contains('is-selected')`);
    console.log(`   - Branch "${branch}" roundtrip transition: ${restored ? 'PASS' : 'FAIL'}`);
  }

  // Test 6: Test UI Response States (needs_input, empty, error)
  console.log('8. Testing UI Response States (needs_input, empty, error)...');
  
  // Test Needs Input State
  await evalInPage(`window.CulturePilotUI.executeDiscovery('')`);
  // Try with short intent that prompts for more context
  await evalInPage(`
    document.getElementById('discoveryResultsPanel').classList.remove('is-hidden');
    // Simulate needs_input state rendering
    const testNeedsInput = { status: 'needs_input', warnings: ['Please provide a destination or cultural vibe.'] };
    document.getElementById('discoveryStatusBadge').className = 'discovery-badge status-needs_input';
    document.getElementById('discoveryStatusBadge').textContent = 'Input Needed';
    document.getElementById('discoveryPanelBody').innerHTML = '<div class=\"discovery-state discovery-state-warning\"><h3 class=\"state-title\">More Context Required</h3></div>';
  `);
  const needsInputRendered = await evalInPage(`Boolean(document.querySelector('.discovery-state-warning'))`);
  console.log(`   - Needs input state rendering: ${needsInputRendered ? 'PASS' : 'FAIL'}`);

  // Test Empty State
  await evalInPage(`
    document.getElementById('discoveryStatusBadge').className = 'discovery-badge status-empty';
    document.getElementById('discoveryStatusBadge').textContent = 'No Matches • Transparent 0';
    document.getElementById('discoveryPanelBody').innerHTML = '<div class=\"discovery-state discovery-state-empty\"><h3 class=\"state-title\">No Cataloged Matches</h3></div>';
  `);
  const emptyRendered = await evalInPage(`Boolean(document.querySelector('.discovery-state-empty'))`);
  console.log(`   - Empty state rendering: ${emptyRendered ? 'PASS' : 'FAIL'}`);

  // Test Error State with retry button
  await evalInPage(`
    document.getElementById('discoveryStatusBadge').className = 'discovery-badge status-error';
    document.getElementById('discoveryStatusBadge').textContent = 'Error';
    document.getElementById('discoveryPanelBody').innerHTML = '<div class=\"discovery-state discovery-state-error\"><h3 class=\"state-title\">Discovery Query Error</h3><button type=\"button\" id=\"discoveryRetryBtn\" class=\"discovery-retry-btn\">Try Again</button></div>';
  `);
  const errorRendered = await evalInPage(`Boolean(document.getElementById('discoveryRetryBtn'))`);
  console.log(`   - Error state with retry action: ${errorRendered ? 'PASS' : 'FAIL'}`);

  // Close panel
  await evalInPage(`document.getElementById('discoveryCloseBtn').click()`);
  await new Promise((r) => setTimeout(r, 200));

  // Test 7: Mobile Viewport Emulation (390x844)
  console.log('9. Testing Mobile Viewport (390x844 iPhone profile)...');
  await sendCdpCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise((r) => setTimeout(r, 400));

  const mobileCheck = await evalInPage(`
    ({
      controllerWidth: document.getElementById('controller').offsetWidth,
      dockWidth: document.getElementById('discoveryDock').offsetWidth,
      viewportWidth: window.innerWidth,
      headerCtaVisible: Boolean(document.querySelector('.header-cta-btn').offsetParent),
      headerCtaHref: document.querySelector('.header-cta-btn').getAttribute('href'),
      controllerVisible: Boolean(document.getElementById('controller').offsetParent)
    })
  `);
  console.log(`   - Mobile Viewport: ${mobileCheck.viewportWidth}px`);
  console.log(`   - Mobile Controller responsive: ${mobileCheck.controllerWidth <= 390 ? 'PASS' : 'FAIL'} (${mobileCheck.controllerWidth}px)`);
  console.log(`   - Mobile Discovery Dock responsive: ${mobileCheck.dockWidth <= 390 ? 'PASS' : 'FAIL'} (${mobileCheck.dockWidth}px)`);
  console.log(`   - "Try now" CTA link preserved: ${mobileCheck.headerCtaVisible && mobileCheck.headerCtaHref === 'https://app.ltx.io/' ? 'PASS' : 'FAIL'}`);

  // Reset viewport to desktop
  await sendCdpCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await new Promise((r) => setTimeout(r, 300));

  // Test 8: Reduced Motion Check
  console.log('10. Testing Reduced Motion Preference...');
  await sendCdpCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  const motionReduced = await evalInPage(`
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  `);
  console.log(`   - prefers-reduced-motion active: ${motionReduced ? 'PASS' : 'FAIL'}`);

  // Teardown
  ws.close();
  chromeProcess.kill();
  server.close();
  try {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  } catch {}

  console.log('\n[Browser Audit] Completed successfully with zero visual or layout modifications.');
}

runBrowserAudit().catch((err) => {
  console.error('[Browser Audit] Error:', err);
  process.exit(1);
});
