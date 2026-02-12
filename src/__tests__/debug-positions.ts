import { migrateFromLayout } from '../pipeline/migrationPipeline.js';
import { detectPagePreset } from '../transformers/pagePresetResolver.js';
import layout from '../../data/reference-content-template.json';

console.log('=== Page Preset Detection ===\n');

// Check each frame for page preset detection
const sourceFrames = (layout as any).pages[0]?.children ?? [];

for (const frame of sourceFrames) {
  const detection = detectPagePreset(frame as any);
  if (detection.isPagePreset) {
    console.log(`Frame "${frame.name}" detected as: ${detection.v2PresetId}`);
    console.log('V1 Props found:', JSON.stringify(detection.v1Props, null, 2));
    console.log('---');
  }
}

console.log('\n=== Migration Result ===\n');

const result = migrateFromLayout(layout as any);

// Show page frames with autoGrow info
console.log('=== Page Frames ===\n');
console.log('Total pages:', result.document.pages.length);
for (const page of result.document.pages) {
  console.log(`Page: ${page.name}, rootId: ${page.rootId}`);
  const rootFrame = result.document.nodes[page.rootId];
  if (rootFrame && rootFrame.type === 'FRAME') {
    console.log(`  autoGrow: ${(rootFrame as any).autoGrow}`);
    console.log(`  minHeight: ${(rootFrame as any).minHeight}`);
    console.log(`  height: ${(rootFrame as any).height}`);
  } else {
    console.log(`  rootFrame not found or not FRAME type:`, rootFrame?.type);
  }
  console.log();
}

// Show components with their props
for (const [_id, node] of Object.entries(result.document.nodes)) {
  if (node.type === 'COMPONENT') {
    const component = node as any;
    console.log(`${component.pluginId}:`);
    console.log(
      '  props:',
      JSON.stringify(component.props, null, 2).split('\n').slice(0, 10).join('\n')
    );
    console.log();
  }
}
