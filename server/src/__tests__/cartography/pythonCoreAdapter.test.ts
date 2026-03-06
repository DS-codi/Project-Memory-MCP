import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../cartography/runtime/pythonBridge.js', () => ({
  invokePythonCore: vi.fn(),
}));

import { invokePythonCore } from '../../cartography/runtime/pythonBridge.js';
import {
  PythonCoreAdapter,
  type PythonCoreRequest,
  type PythonCoreResponse,
} from '../../cartography/adapters/pythonCoreAdapter.js';
import {
  ADAPTER_SCHEMA_VERSION,
  CartographyCompatibilityErrorCode,
} from '../../cartography/contracts/version.js';

function makeBridgeResponse(overrides: Partial<PythonCoreResponse> = {}): PythonCoreResponse {
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    request_id: 'req-001',
    status: 'ok',
    result: {},
    diagnostics: {
      warnings: [],
      errors: [],
      markers: [],
      skipped_paths: [],
    },
    elapsed_ms: 8,
    ...overrides,
  };
}

describe('PythonCoreAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probeCapabilities maps capability payload and sends probe envelope', async () => {
    const capabilityPayload = {
      schema_version: ADAPTER_SCHEMA_VERSION,
      supported_actions: ['cartograph', 'probe_capabilities', 'health_check'],
      supported_languages: ['python', 'typescript'],
      feature_flags: {
        partial_results: true,
        database_cartography: false,
      },
    };

    vi.mocked(invokePythonCore).mockResolvedValue(
      makeBridgeResponse({
        request_id: 'probe_capabilities_req-1',
        result: capabilityPayload,
      })
    );

    const adapter = new PythonCoreAdapter();
    const capabilities = await adapter.probeCapabilities();

    expect(capabilities).toEqual(capabilityPayload);

    expect(vi.mocked(invokePythonCore)).toHaveBeenCalledTimes(1);
    const probeEnvelope = vi.mocked(invokePythonCore).mock.calls[0]?.[0];
    expect(probeEnvelope).toMatchObject({
      schema_version: ADAPTER_SCHEMA_VERSION,
      action: 'probe_capabilities',
      args: {},
      timeout_ms: 15_000,
    });
    expect(probeEnvelope?.request_id).toMatch(/^probe_capabilities_/);
  });

  it('probeCapabilities rejects malformed capability payloads', async () => {
    vi.mocked(invokePythonCore).mockResolvedValue(
      makeBridgeResponse({
        request_id: 'probe_bad_payload',
        result: {
          schema_version: ADAPTER_SCHEMA_VERSION,
          supported_actions: 'cartograph',
          supported_languages: ['python'],
          feature_flags: { partial_results: true },
        } as unknown as PythonCoreResponse['result'],
      })
    );

    const adapter = new PythonCoreAdapter();

    await expect(adapter.probeCapabilities()).rejects.toMatchObject({
      errorCode: CartographyCompatibilityErrorCode.CAPABILITY_MISSING,
      requestId: 'probe_bad_payload',
    });
  });

  it('probeCapabilities enforces schema compatibility on capability payload', async () => {
    vi.mocked(invokePythonCore).mockResolvedValue(
      makeBridgeResponse({
        request_id: 'probe_schema_drift',
        result: {
          schema_version: '2.0.0',
          supported_actions: ['cartograph'],
          supported_languages: ['python'],
          feature_flags: { partial_results: true },
        },
      })
    );

    const adapter = new PythonCoreAdapter();

    await expect(adapter.probeCapabilities()).rejects.toMatchObject({
      errorCode: CartographyCompatibilityErrorCode.SCHEMA_VERSION_TOO_NEW,
      requestId: 'probe_schema_drift',
    });
  });

  it('invoke forwards request envelope and returns runtime envelope when compatible', async () => {
    const request: PythonCoreRequest = {
      schema_version: ADAPTER_SCHEMA_VERSION,
      request_id: 'invoke_req_1',
      action: 'cartograph',
      args: { scope: 'src' },
      timeout_ms: 1200,
    };

    const runtimeEnvelope = makeBridgeResponse({
      request_id: request.request_id,
      status: 'partial',
      result: { nodes: 12 },
      diagnostics: {
        warnings: ['partial scan'],
        errors: [],
        markers: ['partial_scan'],
        skipped_paths: ['node_modules'],
      },
    });

    vi.mocked(invokePythonCore).mockResolvedValue(runtimeEnvelope);

    const adapter = new PythonCoreAdapter();
    const response = await adapter.invoke(request);

    expect(vi.mocked(invokePythonCore)).toHaveBeenCalledWith(request);
    expect(response).toEqual(runtimeEnvelope);
  });

  it.each([
    {
      schema_version: '0.9.0',
      expected: CartographyCompatibilityErrorCode.SCHEMA_VERSION_TOO_OLD,
    },
    {
      schema_version: '2.0.0',
      expected: CartographyCompatibilityErrorCode.SCHEMA_VERSION_TOO_NEW,
    },
    {
      schema_version: 'invalid-semver',
      expected: CartographyCompatibilityErrorCode.SCHEMA_VERSION_MALFORMED,
    },
  ])(
    'invoke rejects incompatible response schema_version $schema_version',
    async ({ schema_version, expected }) => {
      const request: PythonCoreRequest = {
        schema_version: ADAPTER_SCHEMA_VERSION,
        request_id: `invoke_${schema_version}`,
        action: 'health_check',
        args: {},
        timeout_ms: 1000,
      };

      vi.mocked(invokePythonCore).mockResolvedValue(
        makeBridgeResponse({
          request_id: request.request_id,
          schema_version,
        })
      );

      const adapter = new PythonCoreAdapter();

      await expect(adapter.invoke(request)).rejects.toMatchObject({
        errorCode: expected,
        requestId: request.request_id,
      });
    }
  );
});
