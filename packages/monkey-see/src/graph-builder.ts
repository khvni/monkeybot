import type { ActionGraphResult } from "./types";
import type { Trajectory, ActionGraph, ActionNode, ActionEdge } from "@monkeybot/storage";
import { randomUUID } from "node:crypto";

/**
 * Converts raw trajectories into abstracted action graphs (DAGs).
 * Nodes represent distinct actions, edges represent transitions between them.
 * Consecutive identical action types are merged into single nodes.
 */
export class GraphBuilder {
  /**
   * Build an action graph from one or more trajectories.
   * Merges repeated action patterns into reusable graph nodes.
   */
  build(trajectories: Trajectory[], name?: string): ActionGraph {
    const nodes: ActionNode[] = [];
    const edges: ActionEdge[] = [];
    const nodeMap = new Map<string, ActionNode>();

    for (const trajectory of trajectories) {
      let prevNodeId: string | null = null;

      for (const step of trajectory.steps) {
        const nodeKey = this.getNodeKey(step.action, step.meta);
        let node = nodeMap.get(nodeKey);

        if (!node) {
          node = {
            id: randomUUID(),
            label: this.getNodeLabel(step.action, step.text, step.meta),
            actionType: step.action,
            parameters: this.extractParameters(step),
          };
          nodeMap.set(nodeKey, node);
          nodes.push(node);
        }

        // Create edge from previous node to this node
        if (prevNodeId && prevNodeId !== node.id) {
          const existingEdge = edges.find(
            (e) => e.from === prevNodeId && e.to === node!.id
          );
          if (!existingEdge) {
            edges.push({ from: prevNodeId, to: node.id });
          }
        }

        prevNodeId = node.id;
      }
    }

    return {
      id: randomUUID(),
      workflowId: trajectories[0]?.workflowId,
      name: name ?? `Graph from ${trajectories.length} trajectory(s)`,
      nodes,
      edges,
      trajectoryIds: trajectories.map((t) => t.id),
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Generate a unique key for deduplicating nodes.
   * Actions with the same type and similar parameters share a node.
   */
  private getNodeKey(action: string, meta?: Record<string, unknown>): string {
    if (action === "type") return `type:${meta?.keyCount ?? "batch"}`;
    if (action === "click") return `click:${meta?.button ?? "left"}`;
    if (action === "scroll") return `scroll:${((meta?.dy as number) ?? 0) > 0 ? "down" : "up"}`;
    return action;
  }

  /**
   * Generate a human-readable label for a graph node.
   */
  private getNodeLabel(
    action: string,
    text?: string,
    meta?: Record<string, unknown>
  ): string {
    switch (action) {
      case "click":
        return `Click (${meta?.button ?? "left"})`;
      case "type":
        if (text && text.length <= 20) return `Type "${text}"`;
        return `Type (${meta?.keyCount ?? "?"} chars)`;
      case "scroll":
        return `Scroll ${(meta?.dy as number) > 0 ? "down" : "up"}`;
      case "mouse_move":
        return "Move cursor";
      default:
        return action;
    }
  }

  /**
   * Extract relevant parameters from a trajectory step for the graph node.
   */
  private extractParameters(step: {
    action: string;
    x?: number;
    y?: number;
    text?: string;
    meta?: Record<string, unknown>;
  }): Record<string, unknown> | undefined {
    const params: Record<string, unknown> = {};
    if (step.x !== undefined) params.x = step.x;
    if (step.y !== undefined) params.y = step.y;
    if (step.text) params.text = step.text;
    if (step.meta) Object.assign(params, step.meta);
    return Object.keys(params).length > 0 ? params : undefined;
  }

  /**
   * Get a result summary for a generated graph.
   */
  toResult(graph: ActionGraph): ActionGraphResult {
    return {
      graphId: graph.id,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    };
  }
}
