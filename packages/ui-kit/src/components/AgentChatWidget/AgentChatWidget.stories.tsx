import type { Meta, StoryObj } from '@storybook/react';
import { AgentChatWidget } from './AgentChatWidget';
import type { ChatSseEvent, SendRequest } from './AgentChatWidget.types';

const meta: Meta<typeof AgentChatWidget> = {
  title: 'Wave 1.13 [3b] / AgentChatWidget',
  component: AgentChatWidget,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    agentEnabled: true,
    organizationId: 'org-acme',
    userId: 'user-lourdes',
    initialContext: 'none',
    onSend: () => emptyEvents(),
  },
};

export default meta;
type Story = StoryObj<typeof AgentChatWidget>;

async function* emptyEvents(): AsyncIterable<ChatSseEvent> {
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* streamReply(
  text: string,
  delayMs = 25,
): AsyncIterable<ChatSseEvent> {
  for (const word of text.split(' ')) {
    yield { event: 'token', data: { chunk: word + ' ' } };
    await new Promise((r) => setTimeout(r, delayMs));
  }
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* streamWithToolCall(): AsyncIterable<ChatSseEvent> {
  yield { event: 'token', data: { chunk: 'Let me check the recipe…' } };
  await new Promise((r) => setTimeout(r, 200));
  yield { event: 'tool-calling', data: { tool: 'recipes.read' } };
  await new Promise((r) => setTimeout(r, 600));
  yield { event: 'token', data: { chunk: ' Found it: ' } };
  yield {
    event: 'token',
    data: {
      chunk:
        'Bolognesa ragù — yield 88 %, 4 portions, allergens: gluten, milk.',
    },
  };
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* longConversation(): AsyncIterable<ChatSseEvent> {
  const text =
    'Long answer: The Bolognesa ragù margin dropped 4 percentage points this ' +
    'week. The driver is the tomato passata supplier — Mercatona raised the ' +
    'unit price by 12 % on Monday. You have two near-equivalent fallbacks ' +
    'in your supplier book (CashCarry and Makro) at roughly the same yield ' +
    'spec. Want me to draft a source override on the recipe so the next ' +
    'cost rebuild picks the cheaper option?';
  yield* streamReply(text, 8);
}

/**
 * Closed FAB — the entry point. Clicking it opens the sidesheet.
 */
export const Closed: Story = {
  args: {
    onSend: () => emptyEvents(),
  },
};

/**
 * Sidesheet open with the welcome message. No bubbles yet.
 */
export const OpenEmpty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Click the FAB at bottom-right, then read the welcome line. The empty state guides the user toward useful prompts.',
      },
    },
  },
};

/**
 * Mid-conversation — the agent has already replied to one prompt.
 * (Storybook doesn't preserve interaction state between steps; this story
 * shows the visual treatment of a populated message log.)
 */
export const OpenMidConversation: Story = {
  args: {
    onSend: (req: SendRequest) =>
      streamReply(
        req.message.type === 'text'
          ? `Got it — about "${req.message.content.slice(0, 50)}". Here is what I can tell you.`
          : 'Got it — checking your image.',
        10,
      ),
  },
};

/**
 * Streaming response — token-by-token append.
 */
export const Streaming: Story = {
  args: {
    onSend: () =>
      streamReply(
        'Cooking the answer for you, one token at a time, no rush, just the way you like it.',
        50,
      ),
  },
};

/**
 * Tool-calling state — agent surfaces an inline mute note while it invokes
 * an MCP tool, then resumes streaming below it.
 */
export const ToolCalling: Story = {
  args: {
    onSend: () => streamWithToolCall(),
  },
};

/**
 * Long conversation — exercise the scroll behaviour.
 */
export const LongConversation: Story = {
  args: {
    onSend: () => longConversation(),
  },
};

/**
 * Flag disabled — the component renders nothing. Storybook shows an empty
 * canvas; the smoke test asserts the widget returns null.
 */
export const FlagDisabled: Story = {
  args: {
    agentEnabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When `agentEnabled=false` the widget mounts to nothing. No FAB, no listener. Defence in depth alongside apps/api 404.',
      },
    },
  },
};
