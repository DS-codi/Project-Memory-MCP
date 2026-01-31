import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { InstructionFile } from '@/types';
import { API_BASE_URL } from '@/config';

interface InstructionListResponse {
  instructions: InstructionFile[];
}

interface InstructionResponse {
  instruction: InstructionFile;
}

// Fetch all instructions
async function fetchInstructions(): Promise<InstructionListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/instructions`);
  if (!res.ok) throw new Error('Failed to fetch instructions');
  return res.json();
}

// Fetch single instruction
async function fetchInstruction(id: string): Promise<InstructionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/instructions/${id}`);
  if (!res.ok) throw new Error('Failed to fetch instruction');
  return res.json();
}

// Create instruction
async function createInstruction(data: { filename: string; content: string }): Promise<InstructionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create instruction');
  }
  return res.json();
}

// Update instruction
async function updateInstruction(id: string, content: string): Promise<InstructionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/instructions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update instruction');
  }
  return res.json();
}

// Delete instruction
async function deleteInstruction(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/instructions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete instruction');
  }
}

// Fetch instructions for a specific workspace
async function fetchWorkspaceInstructions(workspaceId: string): Promise<InstructionListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/instructions/workspace/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch workspace instructions');
  return res.json();
}

// Deploy instruction to workspace
async function deployInstruction(id: string, workspaceId: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE_URL}/api/instructions/${id}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to deploy instruction');
  }
  return res.json();
}

// Hook for listing all instructions
export function useInstructions() {
  return useQuery({
    queryKey: ['instructions'],
    queryFn: fetchInstructions,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Hook for single instruction
export function useInstruction(id: string | undefined) {
  return useQuery({
    queryKey: ['instruction', id],
    queryFn: () => fetchInstruction(id!),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

// Hook for workspace-specific instructions
export function useWorkspaceInstructions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['instructions', 'workspace', workspaceId],
    queryFn: () => fetchWorkspaceInstructions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 60,
  });
}

// Hook for creating instructions
export function useCreateInstruction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createInstruction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] });
    },
  });
}

// Hook for updating instructions
export function useUpdateInstruction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateInstruction(id, content),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] });
      queryClient.invalidateQueries({ queryKey: ['instruction', id] });
    },
  });
}

// Hook for deleting instructions
export function useDeleteInstruction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteInstruction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] });
    },
  });
}

// Hook for deploying instructions
export function useDeployInstruction() {
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) => 
      deployInstruction(id, workspaceId),
  });
}

export default useInstructions;
