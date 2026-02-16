/**
 * Cross-language protocol conformance tests — TypeScript side.
 *
 * Loads shared-protocol-fixtures.json (the same JSON objects the Rust
 * conformance tests decode) and verifies that the TS wire-protocol
 * functions handle them identically.
 *
 * Step 9 of the MCP Terminal Tool & GUI Approval Flow plan.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeMessage,
  decodeMessage,
  isCommandRequest,
  isCommandResponse,
  isHeartbeat,
} from '../../tools/terminal-ipc-protocol.js';
import type { TerminalIpcMessage } from '../../tools/terminal-ipc-protocol.js';
import fixtures from './shared-protocol-fixtures.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeFixture(message: Record<string, unknown>): TerminalIpcMessage {
  const decoded = decodeMessage(JSON.stringify(message));
  expect(decoded).not.toBeNull();
  return decoded!;
}

// ---------------------------------------------------------------------------
// CommandRequest fixtures
// ---------------------------------------------------------------------------

describe('Protocol conformance — CommandRequest', () => {
  for (const fixture of fixtures.command_requests) {
    describe(fixture.description, () => {
      it('decodes successfully', () => {
        const msg = decodeFixture(fixture.message);
        expect(isCommandRequest(msg)).toBe(true);
      });

      it('preserves all fields', () => {
        const msg = decodeFixture(fixture.message);
        const src = fixture.message as Record<string, unknown>;
        expect(msg.type).toBe('command_request');
        expect(msg.id).toBe(src.id);
        if (isCommandRequest(msg)) {
          expect(msg.command).toBe(src.command);
          expect(msg.working_directory).toBe(src.working_directory);
          if (src.args !== undefined) expect(msg.args).toEqual(src.args);
          if (src.env !== undefined) expect(msg.env).toEqual(src.env);
          if (src.workspace_id !== undefined) expect(msg.workspace_id).toBe(src.workspace_id);
          if (src.session_id !== undefined) expect(msg.session_id).toBe(src.session_id);
          if (src.timeout_seconds !== undefined) expect(msg.timeout_seconds).toBe(src.timeout_seconds);
          if (src.allowlisted !== undefined) expect(msg.allowlisted).toBe(src.allowlisted);
        }
      });

      it('roundtrips through encode → decode', () => {
        const original = decodeFixture(fixture.message);
        const encoded = encodeMessage(original);
        const roundtripped = decodeMessage(encoded);
        expect(roundtripped).toEqual(original);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// CommandResponse fixtures
// ---------------------------------------------------------------------------

describe('Protocol conformance — CommandResponse', () => {
  for (const fixture of fixtures.command_responses) {
    describe(fixture.description, () => {
      it('decodes successfully', () => {
        const msg = decodeFixture(fixture.message);
        expect(isCommandResponse(msg)).toBe(true);
      });

      it('preserves all fields', () => {
        const msg = decodeFixture(fixture.message);
        const src = fixture.message as Record<string, unknown>;
        expect(msg.type).toBe('command_response');
        expect(msg.id).toBe(src.id);
        if (isCommandResponse(msg)) {
          expect(msg.status).toBe(src.status);
          if (src.output !== undefined) expect(msg.output).toBe(src.output);
          // exit_code can be null — test for strict equality
          if ('exit_code' in src) expect(msg.exit_code).toBe(src.exit_code);
          if (src.reason !== undefined) expect(msg.reason).toBe(src.reason);
          if (src.output_file_path !== undefined) expect(msg.output_file_path).toBe(src.output_file_path);
        }
      });

      it('roundtrips through encode → decode', () => {
        const original = decodeFixture(fixture.message);
        const encoded = encodeMessage(original);
        const roundtripped = decodeMessage(encoded);
        expect(roundtripped).toEqual(original);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Heartbeat fixtures
// ---------------------------------------------------------------------------

describe('Protocol conformance — Heartbeat', () => {
  for (const fixture of fixtures.heartbeats) {
    describe(fixture.description, () => {
      it('decodes successfully', () => {
        const msg = decodeFixture(fixture.message);
        expect(isHeartbeat(msg)).toBe(true);
      });

      it('preserves all fields', () => {
        const msg = decodeFixture(fixture.message);
        const src = fixture.message as Record<string, unknown>;
        expect(msg.type).toBe('heartbeat');
        expect(msg.id).toBe(src.id);
        if (isHeartbeat(msg)) {
          expect(msg.timestamp_ms).toBe(src.timestamp_ms);
        }
      });

      it('roundtrips through encode → decode', () => {
        const original = decodeFixture(fixture.message);
        const encoded = encodeMessage(original);
        const roundtripped = decodeMessage(encoded);
        expect(roundtripped).toEqual(original);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid input handling
// ---------------------------------------------------------------------------

describe('Protocol conformance — invalid inputs', () => {
  for (const fixture of fixtures.invalid) {
    it(`returns null for: ${fixture.description}`, () => {
      const result = decodeMessage(fixture.raw);
      expect(result).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Type guard exclusivity
// ---------------------------------------------------------------------------

describe('Protocol conformance — type guard exclusivity', () => {
  it('CommandRequest is not CommandResponse or Heartbeat', () => {
    const msg = decodeFixture(fixtures.command_requests[1].message);
    expect(isCommandRequest(msg)).toBe(true);
    expect(isCommandResponse(msg)).toBe(false);
    expect(isHeartbeat(msg)).toBe(false);
  });

  it('CommandResponse is not CommandRequest or Heartbeat', () => {
    const msg = decodeFixture(fixtures.command_responses[0].message);
    expect(isCommandResponse(msg)).toBe(true);
    expect(isCommandRequest(msg)).toBe(false);
    expect(isHeartbeat(msg)).toBe(false);
  });

  it('Heartbeat is not CommandRequest or CommandResponse', () => {
    const msg = decodeFixture(fixtures.heartbeats[0].message);
    expect(isHeartbeat(msg)).toBe(true);
    expect(isCommandRequest(msg)).toBe(false);
    expect(isCommandResponse(msg)).toBe(false);
  });
});
