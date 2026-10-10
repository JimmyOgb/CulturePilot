import { createServer } from './src/server.js';
import { config } from './src/config.js';

async function main() {
  const server = createServer();
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const port = server.address().port;
  console.log(`[Verification] Test server running on http://localhost:${port}`);

  try {
    const payload = {
      intent: 'I want a weekend in Lagos with an artsy, design-focused, indie-music vibe and good coffee.'
    };

    console.log('[Verification] Sending real end-to-end POST /api/culture request...');
    const startTime = Date.now();
    const res = await fetch(`http://localhost:${port}/api/culture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Verification] Response received in ${elapsed}ms with HTTP status ${res.status}`);

    const data = await res.json();
    console.log('[Verification] Response Summary:');
    console.log('- Status:', data.status);
    console.log('- Discovered Location:', data.discovery_context?.location);
    console.log('- Signals Identified:', data.discovery_context?.identified_signals?.length);
    console.log('- Total Results Returned:', data.results?.length);
    console.log('- Cross-Domain Connections:', data.connections?.length);
    console.log('- Provenance Entries:', data.provenance?.length);
    console.log('- Warnings:', data.warnings?.length);

    console.log('\n--- SAMPLE DISCOVERED RESULTS ---');
    for (const r of (data.results || []).slice(0, 4)) {
      console.log(`• [${r.category.toUpperCase()}] ${r.name}`);
      console.log(`  Entity ID: ${r.entity_id}`);
      console.log(`  Type: ${r.type}`);
      console.log(`  Affinity: ${r.affinity ?? 'N/A'} | Popularity: ${r.popularity ?? 'N/A'}`);
      console.log(`  Address: ${r.properties?.address ?? 'N/A'}`);
      console.log(`  Reason: ${r.reason}`);
      console.log(`  Source: ${JSON.stringify(r.source)}`);
    }

    console.log('\n--- SAMPLE CONNECTIONS ---');
    for (const c of (data.connections || []).slice(0, 2)) {
      console.log(`• Connection: ${c.source_entity} <-> ${c.target_entity}`);
      console.log(`  Shared Vibe: ${c.shared_cultural_vibe}`);
      console.log(`  Basis: ${c.basis}`);
    }

    console.log('\n--- PROVENANCE TRACE ---');
    for (const p of (data.provenance || []).slice(0, 3)) {
      console.log(`• Source: ${p.source} | Endpoint: ${p.endpoint} | Transport: ${p.transport || 'direct'}`);
    }

    // Security & Integrity Checks
    const serialized = JSON.stringify(data);
    const keyLeaked = config.apiKey && serialized.includes(config.apiKey);
    const hasFakeData = data.results.some((r) => !r.entity_id || !r.source?.qloo_entity_id);
    const allHaveProvenance = data.results.every((r) => r.source?.workflow && r.source?.qloo_entity_id);

    console.log('\n--- VERIFICATION CHECKS ---');
    console.log('1. API Key leaked in response?                ', keyLeaked ? 'FAIL (LEAKED!)' : 'PASS (SECURE)');
    console.log('2. All results backed by real Qloo provenance?', allHaveProvenance ? 'PASS' : 'FAIL');
    console.log('3. Any fabricated placeholder entities found? ', hasFakeData ? 'FAIL (FABRICATED)' : 'PASS (GENUINE)');
    console.log('4. CulturePilot status valid?                 ', ['ok', 'partial', 'degraded'].includes(data.status) ? 'PASS' : 'FAIL');

    if (keyLeaked || !allHaveProvenance || hasFakeData) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[Verification] Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
