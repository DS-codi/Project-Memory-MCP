/**
 * OpenAPI TypeScript Client Generator Script
 * 
 * This script generates a TypeScript client from the OpenAPI spec.
 * Run with: npx ts-node scripts/generate-api-client.ts
 * 
 * Prerequisites:
 *   npm install openapi-typescript-codegen --save-dev
 * 
 * Or use openapi-typescript for types only:
 *   npm install openapi-typescript --save-dev
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const SPEC_PATH = path.join(__dirname, '..', 'docs', 'api-spec.yaml');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'api', 'generated');

async function main() {
  console.log('🔧 OpenAPI Client Generator');
  console.log('==========================\n');

  // Check if spec file exists
  if (!fs.existsSync(SPEC_PATH)) {
    console.error(`❌ API spec not found at: ${SPEC_PATH}`);
    process.exit(1);
  }

  console.log(`📄 Spec file: ${SPEC_PATH}`);
  console.log(`📁 Output dir: ${OUTPUT_DIR}`);
  console.log('');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // Option 1: Using openapi-typescript-codegen (full client with axios/fetch)
    console.log('🚀 Generating TypeScript client...\n');
    
    execSync(
      `npx openapi-typescript-codegen --input ${SPEC_PATH} --output ${OUTPUT_DIR} --client fetch --useOptions`,
      { stdio: 'inherit' }
    );

    console.log('\n✅ Client generated successfully!');
    console.log(`\nGenerated files in: ${OUTPUT_DIR}`);
    console.log('\nUsage example:');
    console.log('```typescript');
    console.log("import { WorkspacesService, PlansService } from '@/api/generated';");
    console.log('');
    console.log('// List all workspaces');
    console.log('const workspaces = await WorkspacesService.getApiWorkspaces();');
    console.log('');
    console.log('// Get plan details');
    console.log("const plan = await PlansService.getApiWorkspacesPlans({ workspaceId: 'ws_xxx', planId: 'plan_xxx' });");
    console.log('```');
  } catch (error) {
    console.error('❌ Failed to generate client:', error);
    
    console.log('\n📋 Manual installation steps:');
    console.log('1. Install the generator:');
    console.log('   npm install openapi-typescript-codegen --save-dev');
    console.log('');
    console.log('2. Run generation manually:');
    console.log(`   npx openapi-typescript-codegen --input ${SPEC_PATH} --output ${OUTPUT_DIR} --client fetch --useOptions`);
    
    process.exit(1);
  }
}

main();
