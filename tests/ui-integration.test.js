import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('UI Integration: index.html contains all required accessibility and semantic elements', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  // Verify Critical Elements
  assert.match(html, /id="discoveryDock"/, 'discoveryDock must be present');
  assert.match(html, /id="discoveryForm"/, 'discoveryForm must be present');
  assert.match(html, /id="discoveryInput"/, 'discoveryInput must be present');
  assert.match(html, /id="discoverySubmitBtn"/, 'discoverySubmitBtn must be present');
  assert.match(html, /id="discoveryPrompts"/, 'discoveryPrompts must be present');
  assert.match(html, /id="headerDiscoveryBtn"/, 'headerDiscoveryBtn must be present');
  assert.match(html, /id="discoveryResultsPanel"/, 'discoveryResultsPanel must be present');
  assert.match(html, /id="discoveryPanelBody"/, 'discoveryPanelBody must be present');
  assert.match(html, /id="discoveryCloseBtn"/, 'discoveryCloseBtn must be present');
  assert.match(html, /id="srLiveRegion"/, 'srLiveRegion must be present');
  assert.match(html, /class="discovery-disclaimer"/, 'disclaimer must be present');
});

test('UI Integration: CulturePilotUI renders categories, provenance, and exclusions cleanly', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  // Verify presence of render functions & safe escaping
  assert.match(html, /function renderResults\(data\)/);
  assert.match(html, /function renderLoading\(intent\)/);
  assert.match(html, /function renderError\(message, retryIntent\)/);
  assert.match(html, /function renderNeedsInput\(message\)/);
  assert.match(html, /function renderEmpty\(data\)/);
  assert.match(html, /function escapeHtml\(str\)/);

  // Verify categories rendering
  assert.match(html, /Arts & Design/);
  assert.match(html, /Coffee/);
  assert.match(html, /Music/);

  // Verify provenance and affinity attributes
  assert.match(html, /class="affinity-pill"/);
  assert.match(html, /class="provenance-tag"/);
  assert.match(html, /class="card-reason"/);

  // Verify transparent exclusion diagnostics
  assert.match(html, /class="diagnostics-disclosure"/);
  assert.match(html, /class="excluded-table"/);
});

test('UI Integration: keyboard interaction and focus management', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  // Escape key handler
  assert.match(html, /if \(e\.key === 'Escape'\)/);
  // Trapping / restoring focus
  assert.match(html, /lastActiveElement = document\.activeElement/);
  assert.match(html, /lastActiveElement\.focus\(\)/);
});

test('UI Security: verify zero client-side credentials or secrets in index.html', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  assert.doesNotMatch(html, /hack_[a-zA-Z0-9_-]+/, 'No Qloo Hackathon key permitted');
  assert.doesNotMatch(html, /AIzaSy[a-zA-Z0-9_-]+/, 'No Gemini/Google API key permitted');
  assert.doesNotMatch(html, /process\.env/, 'No server-side process.env in browser file');
});
