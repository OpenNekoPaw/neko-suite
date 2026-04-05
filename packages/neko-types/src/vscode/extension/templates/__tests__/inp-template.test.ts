import { describe, it, expect } from 'vitest';
import { generateMinimalInp, generateHumanoidInp } from '../inp-template';

const MAGIC = 'TRNSRTS\0';
const TEX_SECT = 'TEX_SECT';

function readU32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
  );
}

function parseInp(data: Uint8Array) {
  // Verify magic
  const magic = new TextDecoder().decode(data.slice(0, 8));
  expect(magic).toBe(MAGIC);

  // Read JSON length and extract JSON
  const jsonLen = readU32BE(data, 8);
  const jsonBytes = data.slice(12, 12 + jsonLen);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  // Verify TEX_SECT header
  const texSectOffset = 12 + jsonLen;
  const texSect = new TextDecoder().decode(data.slice(texSectOffset, texSectOffset + 8));
  expect(texSect).toBe(TEX_SECT);

  // Read texture count
  const texCount = readU32BE(data, texSectOffset + 8);

  return { json, texCount, totalSize: data.length };
}

describe('generateMinimalInp', () => {
  it('produces valid INP binary with correct structure', () => {
    const result = generateMinimalInp('TestPuppet');
    const { json, texCount } = parseInp(result);

    expect(json.puppet).toBeDefined();
    expect(json.puppet.meta.name).toBe('TestPuppet');
    expect(json.puppet.nodes.name).toBe('Root');
    expect(json.puppet.nodes.children).toEqual([]);
    expect(json.puppet.param).toEqual([]);
    expect(texCount).toBe(0);
  });

  it('has minimal size (< 1KB)', () => {
    const result = generateMinimalInp('Test');
    expect(result.length).toBeLessThan(1024);
  });
});

describe('generateHumanoidInp', () => {
  it('produces valid INP binary with humanoid body parts', () => {
    const result = generateHumanoidInp('Humanoid');
    const { json, texCount } = parseInp(result);

    expect(json.puppet.meta.name).toBe('Humanoid');
    expect(texCount).toBe(2); // skin + head textures

    // Root → Body → children
    const root = json.puppet.nodes;
    expect(root.name).toBe('Root');
    expect(root.children).toHaveLength(1);

    const body = root.children[0];
    expect(body.name).toBe('Body');
    expect(body.type).toBe('Part');
    expect(body.mesh).toBeDefined();
    expect(body.textures).toEqual([0]);

    // Body has 5 direct children: Head + 2 arms + 2 legs
    expect(body.children).toHaveLength(5);
    const childNames = body.children.map((c: { name: string }) => c.name);
    expect(childNames).toContain('Head');
    expect(childNames).toContain('LeftUpperArm');
    expect(childNames).toContain('RightUpperArm');
    expect(childNames).toContain('LeftUpperLeg');
    expect(childNames).toContain('RightUpperLeg');
  });

  it('has unique uuids for all nodes', () => {
    const result = generateHumanoidInp('Test');
    const { json } = parseInp(result);

    const uuids = new Set<number>();
    function collectUuids(node: {
      uuid: number;
      children?: Array<{ uuid: number; children?: unknown[] }>;
    }) {
      uuids.add(node.uuid);
      if (node.children) {
        for (const child of node.children) collectUuids(child as typeof node);
      }
    }
    collectUuids(json.puppet.nodes);

    // 11 nodes: Root + Body + Head + 4 arm parts + 4 leg parts
    expect(uuids.size).toBe(11);
  });
});
