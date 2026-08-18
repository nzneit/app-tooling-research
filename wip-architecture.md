## Architectural Blueprint: Decoupled State & Business Logic## React + Zustand + XState v5 + TypeScript
This document outlines a professional-grade frontend architecture that isolates business logic, workflow rules, and network operations from the user interface.
------------------------------
## 1. Architectural Strategy
Modern web applications often suffer from "fat components" or "leaky hooks" where UI rendering, API fetching, condition guarding, and local states are tangled together. This framework implements a strict, multi-tier data flow that treats the view layer as a purely declarative, pluggable subsystem.
## The Architectural Blueprint

┌─────────────────────────────────┐
│     1. Service / API Layer      │  ── Pure, asynchronous transport layer (e.g., Fetch/Axios)
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│     2. XState State Machine     │  ── Rules engine: Explicit graph modeling workflows & guards
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│     3. Zustand Global Store     │  ── Pub-sub hub: Central data distributor optimized for React
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│      4. ViewModel Hook          │  ── Data facade: Computes derivations and provides shallow optimization
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│      5. React View Layer        │  ── Pure layout: Passive rendering engine with zero state logic
└─────────────────────────────────┘

## Layer Responsibilities

   1. Service Layer: Standardizes network I/O, serializes payloads, and translates exceptions into typed application errors. It has no awareness of React or the application state.
   2. State Machine (XState): The brain of the application. It maps out states, handles complex transitions, runs side effects via actors, and prevents impossible states natively through deterministic graph constraints.
   3. Global Store (Zustand): Acts as a reactive data bridge. It subscribes to the state machine, mirrors snapshots into small data slices, and presents a flat, unified interface for operations.
   4. ViewModel (Custom Hook): Sanitizes inputs, adds runtime metadata, and computes structural states (e.g., isLoading = status === 'loading'). It utilizes shallow property comparisons to prevent unnecessary view re-renders.
   5. View Layer (React): A declarative UI consumer that binds data directly to elements and forwards user interactions as semantic method calls.

------------------------------
## 2. Implementation Walkthrough
We will build out a Complex Project Creation Workflow utilizing this exact stack.
## Step 1: Establish Strict TypeScript Contracts
Isolate data schemas from state logic so they can be consumed globally by services, machines, stores, and components.

// src/features/project/project.types.ts
export interface Contributor {
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}
export interface ProjectSettings {
  isPrivate: boolean;
  retentionDays: number;
  tags: string[];
}
export interface CreateProjectPayload {
  title: string;
  description: string;
  settings: ProjectSettings;
  contributors: Contributor[];
}
export interface ProjectResponse {
  id: string;
  createdAt: string;
  title: string;
}

## Step 2: The Service Layer
Keep network code simple, reusable, and framework-independent.

// src/features/project/project.service.tsimport { CreateProjectPayload, ProjectResponse } from './project.types';
export const projectService = {
  async saveProject(payload: CreateProjectPayload): Promise<ProjectResponse> {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to save project. Server returned code ${response.status}`);
    }

    return response.json();
  }
};

## Step 3: The Brain — XState Machine (v5)
Model your states explicitly. Conditional event validation is natively guaranteed here: if an event is dispatched while the system is in submitting, it is dropped automatically.

// src/features/project/projectMachine.tsimport { createMachine, assign, fromPromise } from 'xstate';import { projectService } from './project.service';import { CreateProjectPayload } from './project.types';
// Wrap the service call into an XState Promise Actorconst saveProjectActor = fromPromise<any, { payload: CreateProjectPayload }>(
  async ({ input }) => {
    return await projectService.saveProject(input.payload);
  }
);
export const projectMachine = createMachine({
  id: 'projectMachine',
  context: {
    formData: null as CreateProjectPayload | null,
    errorMessage: null as string | null,
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        SUBMIT: {
          target: 'submitting',
          // Guard validation: Enforce data compliance inside the machine rules
          guard: ({ event }) => event.payload.title.trim().length > 0,
          actions: assign({
            formData: ({ event }) => event.payload as CreateProjectPayload
          })
        }
      }
    },
    submitting: {
      invoke: {
        src: saveProjectActor,
        input: ({ context }) => ({ payload: context.formData! }),
        onDone: {
          target: 'success'
        },
        onError: {
          target: 'failure',
          actions: assign({
            errorMessage: ({ event }) => (event.error as Error).message
          })
        }
      }
    },
    success: {
      on: { RESET: 'idle' }
    },
    failure: {
      on: {
        RETRY: 'submitting',
        CANCEL: 'idle'
      }
    }
  }
});

## Step 4: The Reactive Bridge — Zustand Global Store
Zustand orchestrates the lifecycle runtime of the actor and handles publishing updates across the UI.

// src/features/project/useProjectStore.tsimport { create } from 'zustand';import { createActor } from 'xstate';import { projectMachine } from './projectMachine';import { CreateProjectPayload } from './project.types';
// Instantiate the persistent global actor engineconst globalProjectActor = createActor(projectMachine);
interface ProjectStoreState {
  status: 'idle' | 'submitting' | 'success' | 'failure';
  errorMessage: string | null;
  submitProject: (data: CreateProjectPayload) => void;
  resetWorkflow: () => void;
}
export const useProjectStore = create<ProjectStoreState>((set) => {
  // Bind XState updates into Zustand's internal state tracker
  globalProjectActor.subscribe((snapshot) => {
    set({
      status: snapshot.value as ProjectStoreState['status'],
      errorMessage: snapshot.context.errorMessage,
    });
  });

  // Start the machine runner execution loop
  globalProjectActor.start();

  return {
    status: 'idle',
    errorMessage: null,

    // Expose clean semantic facade methods to hide raw XState event schemas
    submitProject: (data) => {
      globalProjectActor.send({ type: 'SUBMIT', payload: data });
    },
    resetWorkflow: () => {
      globalProjectActor.send({ type: 'RESET' });
    }
  };
});

## Step 5: The Interface Layer — ViewModel Hook
The ViewModel sanitizes raw form input properties and provides atomic, optimized re-render selections out of Zustand.

// src/features/project/useProjectViewModel.tsimport { useProjectStore } from './useProjectStore';import { useShallow } from 'zustand/react/shallow';import { CreateProjectPayload } from './project.types';
export function useProjectViewModel() {
  // useShallow verifies exact property shifts rather than pointer changes
  return useProjectStore(
    useShallow((state) => {
      const isSubmitting = state.status === 'submitting';
      const isSuccess = state.status === 'success';

      const handleSanitizedSubmit = (rawForm: CreateProjectPayload) => {
        const cleanedPayload: CreateProjectPayload = {
          ...rawForm,
          title: rawForm.title.trim(),
          settings: {
            ...rawForm.settings,
            // Pre-flight data standardization
            retentionDays: Math.max(1, rawForm.settings.retentionDays),
            tags: rawForm.settings.tags.map((tag) => tag.toLowerCase().trim()),
          }
        };
        state.submitProject(cleanedPayload);
      };

      return {
        // Exposed States
        error: state.errorMessage,
        isLoading: isSubmitting,
        isSuccess,
        canModifyForm: !isSubmitting && !isSuccess,
        
        // Exposed Actions
        submit: handleSanitizedSubmit,
        reset: state.resetWorkflow,
      };
    })
  );
}

## Step 6: The View Layer — Pure React Component
Because the entire state machine logic, network calling sequence, and value validation have been pulled out into upstream layers, the React component stays lightweight, declarative, and easily readable.

// src/features/project/ProjectForm.tsximport React, { useState } from 'react';import { useProjectViewModel } from './useProjectViewModel';import { CreateProjectPayload } from './project.types';
export const ProjectForm: React.FC = () => {
  const { isLoading, error, isSuccess, canModifyForm, submit, reset } = useProjectViewModel();

  // Local scratchpad purely for UI binding before operational commit
  const [form, setForm] = useState<CreateProjectPayload>({
    title: '',
    description: '',
    settings: { isPrivate: true, retentionDays: 30, tags: [] },
    contributors: []
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(form);
  };

  if (isSuccess) {
    return (
      <div className="alert success">
        <h3>Project Form Created Successfully!</h3>
        <button onClick={reset}>Create Another Project</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form-layout">
      <h2>Create New Project</h2>
      {error && <div className="alert error">{error}</div>}

      <div className="input-group">
        <input
          type="text"
          value={form.title}
          disabled={!canModifyForm}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Enter title here"
          required
        />
      </div>

      <div className="input-group">
        <label>
          <input
            type="checkbox"
            checked={form.settings.isPrivate}
            disabled={!canModifyForm}
            onChange={(e) => setForm({
              ...form,
              settings: { ...form.settings, isPrivate: e.target.checked }
            })}
          />
          Private Workspace
        </label>
      </div>

      <button type="submit" disabled={isLoading || !form.title.trim()}>
        {isLoading ? 'Processing Pipeline...' : 'Commit Changes'}
      </button>
    </form>
  );
};

------------------------------
## 3. Core Architectural Rules

* Serializable Payloads: Never pass React DOM nodes, component state reference handles, or browser events into an XState engine payload. Keep fields pure JSON-safe data.
* Uni-Directional Data Flow: React inputs event -> ViewModel cleans data -> Zustand routes call -> XState rules trigger updates -> Zustand updates state slices -> React renders UI change.
* The Single-Set Rule: Zustand store actions must never call set() natively to update application values manually. All states flow downward by letting XState process events and emit updates through the .subscribe() stream.