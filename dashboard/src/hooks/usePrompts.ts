import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PromptTemplate } from '@/types';
import { API_BASE_URL } from '@/config';

interface PromptListResponse {
  prompts: PromptTemplate[];
}

interface PromptResponse {
  prompt: PromptTemplate;
}

// Fetch all prompts
async function fetchPrompts(): Promise<PromptListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/prompts`);
  if (!res.ok) throw new Error('Failed to fetch prompts');
  return res.json();
}

// Fetch single prompt
async function fetchPrompt(id: string): Promise<PromptResponse> {
  const res = await fetch(`${API_BASE_URL}/api/prompts/${id}`);
  if (!res.ok) throw new Error('Failed to fetch prompt');
  return res.json();
}

// Create prompt
async function createPrompt(data: { filename: string; content: string }): Promise<PromptResponse> {
  const res = await fetch(`${API_BASE_URL}/api/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create prompt');
  }
  return res.json();
}

// Update prompt
async function updatePrompt(id: string, content: string): Promise<PromptResponse> {
  const res = await fetch(`${API_BASE_URL}/api/prompts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update prompt');
  }
  return res.json();
}

// Delete prompt
async function deletePrompt(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/prompts/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete prompt');
  }
}

// Deploy prompt to workspace
async function deployPrompt(id: string, workspaceId: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE_URL}/api/prompts/${id}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to deploy prompt');
  }
  return res.json();
}

// Hook for listing prompts
export function usePrompts() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPrompts,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Hook for single prompt
export function usePrompt(id: string | undefined) {
  return useQuery({
    queryKey: ['prompt', id],
    queryFn: () => fetchPrompt(id!),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

// Hook for creating prompts
export function useCreatePrompt() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createPrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}

// Hook for updating prompts
export function useUpdatePrompt() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updatePrompt(id, content),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompt', id] });
    },
  });
}

// Hook for deleting prompts
export function useDeletePrompt() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deletePrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}

// Hook for deploying prompts
export function useDeployPrompt() {
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) => 
      deployPrompt(id, workspaceId),
  });
}

export default usePrompts;
