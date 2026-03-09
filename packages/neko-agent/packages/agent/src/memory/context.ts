/**
 * Context Management - Legacy module
 *
 * All classes previously in this file have been removed.
 * Use ConversationCompressor from '../context' instead.
 *
 * Removed:
 * - SimpleTokenCounter → use ConversationCompressor.estimateTokens()
 * - SlidingWindowCompressor → use ConversationCompressor
 * - SummarizeCompressor → use ConversationCompressor with ISummarizer
 * - SelectiveCompressor → use ConversationCompressor
 * - ContextManager → use ConversationCompressor
 */
