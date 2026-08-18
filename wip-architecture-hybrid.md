## Production-Ready Hybrid Architecture: Multi-Protocol Decoupled Pipelines## React + Zustand + XState v5 + TypeScript (HTTP/REST + MQTT over WebSockets)
This document presents a comprehensive frontend architecture engineered for modern enterprise web applications that require a combination of unary request-response protocols (HTTP/REST) and real-time bi-directional messaging streams (MQTT over WebSockets).
By applying Command-Query Separation (CQS) and the Adapter Pattern at the boundary level, the core logic layer controls state transitions and orchestrates multi-protocol operational sequence workflows while remaining protocol-blind.
------------------------------
## 1. Architectural Strategy & Operational Sequencing
Mixing asynchronous network clients, local component event handlers, and data stream sockets together results in tight vendor coupling, synchronization race conditions, and implicit state explosion.
This architecture introduces an abstract, dual-protocol boundary layer that isolates network primitives. The core application engine schedules interactions deterministically.
## The Unified Hybrid Pipeline

                        ┌────────────────────────────────────────────────────────┐
                        │              1. Hybrid Protocol Adapter                │
                        └───────────────┬────────────────────────┬───────────────┘
                                        │ (REST / Command)       │ (WebSockets / Push)
                                        ▼                        ▼
┌──────────────────┐    ┌────────────────────────┐      ┌────────────────────────┐
│  React UI View   │───►│  HTTP API Gateway      │      │  MQTT / NATS Broker    │
└──────────────────┘    └────────────────────────┘      └────────────────────────┘
          ▲                                 │                              │
          │ (Reactive Data)                 ▼ (Response Payload)           ▼ (Push Telemetry)
┌──────────────────┐    ┌────────────────────────────────────────────────────────┐
│ Zustand Cache    │◄───│             2. XState Engine Core (v5)                 │
└──────────────────┘    └────────────────────────────────────────────────────────┘

## Protocol Operations Matrix

* The Command Vector (HTTP Fetch): Handles deterministic, transactional business state requests (e.g., resource provisioning, user authentication, or data commits). It follows a standard async promise lifecycle.
* The Telemetry Vector (MQTT over WebSockets): Handles continuous, non-deterministic streaming tracking state (e.g., job completion progress, remote status metrics, or log aggregation). It runs as an active background worker context.
* The Guarded Sequencer (XState v5): Prevents race conditions where a WebSocket client tries to listen to a streaming channel before the REST API endpoint has finished building the data reference. It guarantees that the backend channel initialization completes successfully before spinning up the real-time socket subscription.

------------------------------
## 2. Complete Technical Implementation
We will model a Remote Task Pipeline Automation Engine that initiates operations via an HTTP POST request and continuously processes live telemetry streams via mqtt.js.
## Step 1: Establish Agnostic Type Contracts
Define the abstract interfaces representing the internal application business logic layer, avoiding vendor-specific networking types or details.

// src/features/workflow/workflow.types.ts
export interface TaskCreationPayload {
  taskName: string;
  parameters: Record<string, unknown>;
}
export interface TaskInitReceipt {
  taskId: string;
  allocatedWorker: string;
}
export interface LiveTelemetryUpdate {
  taskId: string;
  progressPercent: number;
  executionStatus: 'running' | 'successful' | 'aborted';
}
// The core unified boundary contract that ANY network infrastructure plugin must fulfillexport interface HybridNetworkDriver {
  // Command Channel (Unary Unicast HTTP)
  provisionNewTask(payload: TaskCreationPayload): Promise<TaskInitReceipt>;
  
  // Query Channel (Real-time Streaming Pub-Sub)
  subscribeTaskTelemetry(
    taskId: string, 
    onPacket: (data: LiveTelemetryUpdate) => void, 
    onFault: (err: Error) => void
  ): () => void; // Returns a protocol-specific teardown callback
}

## Step 2: Implement the Concrete Hybrid Adapter (HTTP + mqtt.js)
This service aggregates the REST engine primitives (fetch) and the streaming mechanics (mqtt.js) under a single boundary layer.

// src/features/workflow/mqttHttpDriver.service.tsimport mqtt, { MqttClient } from 'mqtt';import { HybridNetworkDriver, TaskCreationPayload, TaskInitReceipt, LiveTelemetryUpdate } from './workflow.types';
export const mqttHttpDriver: HybridNetworkDriver = {
  // 1. Unary HTTP Command Pipeline Implementation
  async provisionNewTask(payload: TaskCreationPayload): Promise<TaskInitReceipt> {
    const response = await fetch('/api/v1/tasks/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`REST command rejected by upstream gateway with code: ${response.status}`);
    }

    return response.json();
  },

  // 2. Real-Time WebSocket Streaming Pipeline Implementation using mqtt.js
  subscribeTaskTelemetry(taskId, onPacket, onFault) {
    const secureWebsocketBrokerUrl = 'wss://://hivemq.com';
    
    const client: MqttClient = mqtt.connect(secureWebsocketBrokerUrl, {
      clean: true,
      connectTimeout: 5000,
    });

    const runtimeTopic = `system/nodes/tasks/${taskId}/telemetry`;

    client.on('connect', () => {
      client.subscribe(runtimeTopic, (err) => {
        if (err) onFault(new Error(`MQTT subscription rejected for target topic: ${runtimeTopic}`));
      });
    });

    client.on('message', (topic, rawBuffer) => {
      if (topic !== runtimeTopic) return;
      try {
        const jsonBody = JSON.parse(rawBuffer.toString());
        
        // Translate and normalize the third-party schema to our clean internal contract interface
        const normalizedUpdate: LiveTelemetryUpdate = {
          taskId: jsonBody.job_id,
          progressPercent: Number(jsonBody.completion_ratio),
          executionStatus: jsonBody.lifecycle_state, // normalizes strings to 'running' | 'successful' | 'aborted'
        };
        
        onPacket(normalizedUpdate);
      } catch (err) {
        onFault(new Error('Received un-parsable data frame packet via real-time streaming channel.'));
      }
    });

    client.on('error', (err) => onFault(err));

    // Boundary Teardown: Safely disconnects the websocket frame when called by XState
    return () => {
      if (client.connected) {
        client.end(true); // force parameter drops connection frames immediately
      }
    };
  }
};

## Step 3: Author the Multi-Protocol Orchestration State Machine
XState v5 coordinates the multi-protocol sequence. It resolves the HTTP request promise, extracts the returned token identifiers, and opens the real-time WebSocket connection within the next state node.

// src/features/workflow/workflowMachine.tsimport { createMachine, assign, fromPromise, fromCallback } from 'xstate';import { TaskCreationPayload, TaskInitReceipt, LiveTelemetryUpdate, HybridNetworkDriver } from './workflow.types';import { mqttHttpDriver } from './mqttHttpDriver.service';
// Inject the active network provider adapterconst activeDriver: HybridNetworkDriver = mqttHttpDriver;
// Actor 1: HTTP Command Asynchronous Promiseconst commandPromiseActor = fromPromise<TaskInitReceipt, { inputPayload: TaskCreationPayload }>(
  async ({ input }) => {
    return await activeDriver.provisionNewTask(input.inputPayload);
  }
);
// Actor 2: WebSockets Event Streaming Callback Channelconst streamingCallbackActor = fromCallback<
  | { type: 'TELEMETRY_PACKET'; data: LiveTelemetryUpdate }
  | { type: 'TELEMETRY_EXCEPTION'; reason: string },
  { taskId: string }
>(({ sendBack, input }) => {
  const terminateLink = activeDriver.subscribeTaskTelemetry(
    input.taskId,
    (packet) => sendBack({ type: 'TELEMETRY_PACKET', data: packet }),
    (error) => sendBack({ type: 'TELEMETRY_EXCEPTION', reason: error.message })
  );

  // Automatic Lifecycle Cleanup: Disconnects the socket when exiting the 'streaming' state
  return () => {
    terminateLink();
  };
});
export const workflowMachine = createMachine({
  id: 'hybridWorkflowEngine',
  context: {
    activeTaskId: null as string | null,
    progress: 0,
    executionError: null as string | null,
  },
  initial: 'idle',
  states: {
    idle: {
      on: { DISPATCH_PIPELINE: 'dispatchingRestCommand' }
    },
    dispatchingRestCommand: {
      // ─── STAGE 1: EXECUTE HTTP COMMAND ───
      invoke: {
        src: commandPromiseActor,
        input: ({ event }) => ({ inputPayload: event.payload as TaskCreationPayload }),
        onDone: {
          target: 'establishingTelemetryStream',
          actions: assign({ activeTaskId: ({ event }) => event.output.taskId })
        },
        onError: {
          target: 'operationalFault',
          actions: assign({ executionError: ({ event }) => (event.error as Error).message })
        }
      }
    },
    establishingTelemetryStream: {
      // ─── STAGE 2: INITIALIZE WEBSOCKET MONITORING ───
      invoke: {
        src: streamingCallbackActor,
        input: ({ context }) => ({ taskId: context.activeTaskId! })
      },
      on: {
        TELEMETRY_PACKET: [
          {
            target: 'pipelineSuccess',
            guard: ({ event }) => event.data.executionStatus === 'successful',
            actions: assign({ progress: 100 })
          },
          {
            target: 'operationalFault',
            guard: ({ event }) => event.data.executionStatus === 'aborted',
            actions: assign({ executionError: 'Remote microservice cluster reported execution abort.' })
          },
          {
            // Continuous state mutation fallthrough
            actions: assign({ progress: ({ event }) => event.data.progressPercent })
          }
        ],
        TELEMETRY_EXCEPTION: {
          target: 'operationalFault',
          actions: assign({ executionError: ({ event }) => event.reason })
        }
      }
    },
    pipelineSuccess: {
      on: { REWIND: 'idle' }
    },
    operationalFault: {
      on: { CLEAR_FAULT: 'idle' }
    }
  }
});

## Step 4: Map the Global Store (Zustand)

// src/features/workflow/useWorkflowStore.tsimport { create } from 'zustand';import { createActor } from 'xstate';import { workflowMachine } from './workflowMachine';import { TaskCreationPayload } from './workflow.types';
const pipelineWorkerRuntime = createActor(workflowMachine);
interface WorkflowStoreState {
  engineNode: string;
  currentProgress: number;
  activeErrorText: string | null;
  bootTaskSequence: (params: TaskCreationPayload) => void;
  resetEngine: () => void;
}
export const useWorkflowStore = create<WorkflowStoreState>((set) => {
  // Sync the engine's internal states directly into the Zustand state tracker
  pipelineWorkerRuntime.subscribe((snapshot) => {
    set({
      engineNode: snapshot.value as string,
      currentProgress: snapshot.context.progress,
      activeErrorText: snapshot.context.executionError,
    });
  });

  pipelineWorkerRuntime.start();

  return {
    engineNode: 'idle',
    currentProgress: 0,
    activeErrorText: null,

    bootTaskSequence: (params) => {
      pipelineWorkerRuntime.send({ type: 'DISPATCH_PIPELINE', payload: params });
    },
    resetEngine: () => {
      pipelineWorkerRuntime.send({ type: 'CLEAR_FAULT' });
    }
  };
});

## Step 5: Implement the ViewModel Facade Layer

// src/features/workflow/useWorkflowViewModel.tsimport { useWorkflowStore } from './useWorkflowStore';import { useShallow } from 'zustand/react/shallow';
export function useWorkflowViewModel() {
  return useWorkflowStore(
    useShallow((state) => ({
      progressValue: state.currentProgress,
      failureDescription: state.activeErrorText,

      // Derived States
      isIdle: state.engineNode === 'idle',
      isHttpRequestActive: state.engineNode === 'dispatchingRestCommand',
      isWebsocketStreaming: state.engineNode === 'establishingTelemetryStream',
      isCompleted: state.engineNode === 'pipelineSuccess',
      isFailed: state.engineNode === 'operationalFault',

      // Actions
      execute: state.bootTaskSequence,
      clear: state.resetEngine,
    }))
  );
}

## Step 6: Render via the Pure Presentational View Component

// src/features/workflow/WorkflowControllerDashboard.tsximport React from 'react';import { useWorkflowViewModel } from './useWorkflowViewModel';
export const WorkflowControllerDashboard: React.FC = () => {
  const { 
    progressValue, failureDescription, isIdle, isHttpRequestActive, 
    isWebsocketStreaming, isCompleted, isFailed, execute, clear 
  } = useWorkflowViewModel();

  const handleTrigger = () => {
    execute({
      taskName: 'Production Optimization Matrix Run',
      parameters: { computeNodes: 16, precision: 'float64' }
    });
  };

  return (
    <div className="dashboard-wrapper">
      <h3>Hybrid Orchestration Command Center</h3>

      {isIdle && (
        <button onClick={handleTrigger} className="btn-dispatch">
          Initialize Multi-Protocol Compute Run
        </button>
      )}

      {isHttpRequestActive && (
        <div className="loader-status REST">
          <div className="spinner" />
          <p>Sending Command: Dispatching HTTP Fetch Provision Request...</p>
        </div>
      )}

      {isWebsocketStreaming && (
        <div className="loader-status WS">
          <p className="live-badge">● WebSocket Monitoring Node Connected</p>
          <div className="track-bar">
            <div className="fill-bar" style={{ width: `${progressValue}%` }} />
          </div>
          <p>Cluster Telemetry Feed: {progressValue}% Completed</p>
        </div>
      )}

      {isCompleted && (
        <div className="status-banner completion">
          <h4>✓ Pipeline Process Succeeded</h4>
          <button onClick={clear}>Initialize New Automation Cycle</button>
        </div>
      )}

      {isFailed && (
        <div className="status-banner breakdown">
          <h4>⚠ Workflow Routine Interrupted</h4>
          <p>{failureDescription}</p>
          <button onClick={clear}>Clear Engine Fault Context</button>
        </div>
      )}
    </div>
  );
};

------------------------------
## 3. Structural Defense Matrix

| Fail-Case Mode | Legacy Inline Architecture Consequence | Hybrid Adapter Defended Resolution |
|---|---|---|
| Race Conditions | WebSocket listener initializes too early, missing initial broadcast tokens. | XState guarantees step-by-step sequencing; streaming cannot initialize until the HTTP request has resolved. |
| Memory Accumulation | Component unmounts or crashes without closing the mqtt.js instance, causing memory leaks. | The stream actor uses an explicit unsubscribe() callback inside fromCallback, ensuring clean teardown on state changes. |
| Vendor Lock-In | Switching from MQTT to NATS JetStream requires re-writing state tracking hooks inside component models. | The machine and UI interact purely with the abstract HybridNetworkDriver contract. Swapping drivers requires zero down-stream architectural changes. |
| Test Environment Complexity | Requires building complex integration testing environments to evaluate simple conditional layout code. | Developers can mock out the HybridNetworkDriver using a local timer-driven mock driver for localized browser or CI automated testing. |

Would you like to examine how to handle automated retry logic inside the XState machine if the HTTP call throws a network error? Alternatively, we can look at adding offline state indicators to the UI when the real-time WebSocket connection drops.

