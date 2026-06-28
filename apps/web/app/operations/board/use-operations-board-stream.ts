'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, api } from '@/lib/api';
import type { OperationsBoardResponse } from './board-types';

export function boardQueryKey(queryPath: string) {
  return ['operations-board', queryPath] as const;
}

export function boardStreamUrl(queryPath: string): string {
  const qs = queryPath.includes('?') ? queryPath.slice(queryPath.indexOf('?')) : '';
  return `${API_URL}/operations/board/stream${qs}`;
}

export function useOperationsBoardStream(
  queryPath: string,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;
  const queryKey = boardQueryKey(queryPath);

  const query = useQuery({
    queryKey,
    queryFn: () => api<OperationsBoardResponse>(queryPath),
    enabled,
    staleTime: Infinity,
  });

  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(boardStreamUrl(queryPath));

    source.addEventListener('snapshot', (event) => {
      try {
        const board = JSON.parse(event.data) as OperationsBoardResponse;
        queryClient.setQueryData(queryKey, board);
        setStreamConnected(true);
      } catch {
        // ignore malformed payloads
      }
    });

    source.addEventListener('ping', () => {
      setStreamConnected(true);
    });

    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);

    return () => {
      source.close();
      setStreamConnected(false);
    };
  }, [enabled, queryClient, queryKey, queryPath]);

  return { ...query, streamConnected };
}
