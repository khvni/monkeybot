import type { LearningPipelineConfig, SummaryResult } from "./types";
import type { Trajectory, ActionGraph, NLSummary } from "@monkeybot/storage";
import { randomUUID } from "node:crypto";

const DEFAULT_MODEL = "google/gemini-flash-1.5";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

/**
 * Generates natural language summaries of recorded workflows using OpenRouter LLM calls.
 * Supports summarizing individual trajectories, action graphs, or full workflows.
 */
export class Summarizer {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: LearningPipelineConfig) {
    this.apiKey = config.openRouterApiKey;
    this.model = config.openRouterModel ?? DEFAULT_MODEL;
    this.baseUrl = config.openRouterBaseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Summarize a trajectory into natural language.
   */
  async summarizeTrajectory(
    trajectory: Trajectory,
    workflowId?: string
  ): Promise<NLSummary> {
    const stepDescriptions = trajectory.steps.map((step, i) => {
      let desc = `${i + 1}. ${step.action}`;
      if (step.text) desc += ` "${step.text}"`;
      if (step.x !== undefined && step.y !== undefined) desc += ` at (${step.x}, ${step.y})`;
      if (step.meta) desc += ` [${JSON.stringify(step.meta)}]`;
      return desc;
    });

    const prompt = `Summarize the following computer interaction recording into a concise, natural language description of what the user did and what task they were performing.

Recording: "${trajectory.name}"
Steps:
${stepDescriptions.join("\n")}

Provide a 1-3 sentence summary focused on the high-level task, not individual clicks.`;

    const summary = await this.callLLM(prompt);
    const now = Math.floor(Date.now() / 1000);

    return {
      id: randomUUID(),
      workflowId: workflowId ?? trajectory.workflowId,
      targetType: "trajectory",
      targetId: trajectory.id,
      summary,
      generatedBy: this.model,
      createdAt: now,
    };
  }

  /**
   * Summarize an action graph into natural language.
   */
  async summarizeActionGraph(
    graph: ActionGraph,
    workflowId?: string
  ): Promise<NLSummary> {
    const nodeDescriptions = graph.nodes.map((n) => `  - ${n.label} (${n.actionType})`);
    const edgeDescriptions = graph.edges.map((e) => {
      const fromNode = graph.nodes.find((n) => n.id === e.from);
      const toNode = graph.nodes.find((n) => n.id === e.to);
      return `  - ${fromNode?.label ?? e.from} → ${toNode?.label ?? e.to}`;
    });

    const prompt = `Summarize the following workflow graph into a concise natural language description of the automated task it represents.

Graph: "${graph.name}"
Nodes (actions):
${nodeDescriptions.join("\n")}

Edges (transitions):
${edgeDescriptions.join("\n")}

Provide a 1-3 sentence summary of the overall workflow this graph represents.`;

    const summary = await this.callLLM(prompt);
    const now = Math.floor(Date.now() / 1000);

    return {
      id: randomUUID(),
      workflowId: workflowId ?? graph.workflowId,
      targetType: "action_graph",
      targetId: graph.id,
      summary,
      generatedBy: this.model,
      createdAt: now,
    };
  }

  /**
   * Generate a high-level workflow summary combining trajectory and graph context.
   */
  async summarizeWorkflow(
    workflowId: string,
    trajectories: Trajectory[],
    graphs: ActionGraph[]
  ): Promise<NLSummary> {
    const trajDescs = trajectories.map(
      (t) => `  - "${t.name}" (${t.steps.length} steps)`
    );
    const graphDescs = graphs.map(
      (g) => `  - "${g.name}" (${g.nodes.length} nodes, ${g.edges.length} edges)`
    );

    const prompt = `Summarize the following learned workflow. This workflow was taught by a user demonstrating tasks on their computer.

Trajectories recorded:
${trajDescs.join("\n") || "  (none)"}

Action graphs derived:
${graphDescs.join("\n") || "  (none)"}

Provide a concise 1-3 sentence summary describing what this workflow does and when it should be used.`;

    const summary = await this.callLLM(prompt);
    const now = Math.floor(Date.now() / 1000);

    return {
      id: randomUUID(),
      workflowId,
      targetType: "workflow",
      targetId: workflowId,
      summary,
      generatedBy: this.model,
      createdAt: now,
    };
  }

  /**
   * Get a SummaryResult from an NLSummary.
   */
  toResult(nlSummary: NLSummary): SummaryResult {
    return {
      summaryId: nlSummary.id,
      summary: nlSummary.summary,
    };
  }

  /**
   * Call the OpenRouter API to generate a completion.
   */
  private async callLLM(userPrompt: string): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content:
          "You are a workflow summarization assistant. Given recordings of user actions on a computer, you produce clear, concise natural language descriptions of what the user was doing.",
      },
      { role: "user", content: userPrompt },
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/khvni/monkeybot",
        "X-Title": "monkeybot",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 256,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned empty response");
    }

    return content.trim();
  }
}
