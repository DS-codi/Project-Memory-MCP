/**
 * Chat Module - Exports for Copilot Chat integration
 */

export { McpBridge, McpBridgeConfig, ToolDefinition } from './McpBridge';
export { ChatParticipant } from './ChatParticipant';
export { ToolProvider } from './ToolProvider';
export {
	cancelPendingAction,
	confirmPendingAction,
	createTrustedMarkdown,
	showConfirmation,
	withProgress,
	renderPlanActionButtons,
	renderStepCommandLinks,
	renderFileReferences,
} from './ChatResponseHelpers';
