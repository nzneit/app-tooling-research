// Feature code done right: it talks to the boundary handle and to TanStack
// Query, and knows nothing about mqtt or the generated client.
import { useQuery } from "@tanstack/react-query";
import { boundary } from "../../app/transport.js";

export function renderPanel(): unknown {
  return { useQuery, connection: boundary().actor.getSnapshot().connection };
}
