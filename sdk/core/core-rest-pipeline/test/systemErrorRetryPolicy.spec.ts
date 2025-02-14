// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert, describe, it, vi, afterEach, expect } from "vitest";

import {
  type PipelineResponse,
  RestError,
  type SendRequest,
  createHttpHeaders,
  createPipelineRequest,
  systemErrorRetryPolicy,
} from "../src";
import { DEFAULT_RETRY_POLICY_COUNT } from "../src/constants";

describe("systemErrorRetryPolicy", function () {
  afterEach(function () {
    vi.useRealTimers();
  });

  it("It should retry after a system error", async () => {
    const request = createPipelineRequest({
      url: "https://bing.com",
    });
    const systemError = new RestError("Test Error!", { code: "ENOENT" });
    const successResponse: PipelineResponse = {
      headers: createHttpHeaders(),
      request,
      status: 200,
    };

    const policy = systemErrorRetryPolicy();
    const next = vi.fn<Parameters<SendRequest>, ReturnType<SendRequest>>();
    next.mockRejectedValueOnce(systemError);
    next.mockResolvedValueOnce(successResponse);

    vi.useFakeTimers();

    const promise = policy.sendRequest(request, next);
    expect(next).toHaveBeenCalledOnce();

    // allow the delay to occur
    const before = Date.now();
    await vi.advanceTimersToNextTimerAsync();
    // should be at least the standard delay
    assert.isAtLeast(Date.now() - before, 500);
    expect(next).toHaveBeenCalledTimes(2);

    const result = await promise;

    assert.strictEqual(result, successResponse);
  });

  it("It should give up after the limit is reached", async () => {
    const request = createPipelineRequest({
      url: "https://bing.com",
    });
    const systemError = new RestError("Test Error!", { code: "ENOENT" });

    const policy = systemErrorRetryPolicy();
    const next = vi.fn<Parameters<SendRequest>, ReturnType<SendRequest>>();
    next.mockRejectedValue(systemError);

    vi.useFakeTimers();

    let catchCalled = false;
    const promise = policy.sendRequest(request, next);
    promise.catch((e) => {
      catchCalled = true;
      assert.strictEqual(e, systemError);
    });
    await vi.runAllTimersAsync();
    // should be one more than the default retry count
    expect(next).toHaveBeenCalledTimes(DEFAULT_RETRY_POLICY_COUNT + 1);
    assert.isTrue(catchCalled);
  });
});
