import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatWidget } from './AgentChatWidget';
import type { ChatSseEvent, SendRequest } from './AgentChatWidget.types';

async function* doneOnly(): AsyncIterable<ChatSseEvent> {
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* tokensThenDone(text: string): AsyncIterable<ChatSseEvent> {
  for (const ch of text.split('')) {
    yield { event: 'token', data: { chunk: ch } };
  }
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* toolCallThenAnswer(): AsyncIterable<ChatSseEvent> {
  yield { event: 'token', data: { chunk: 'Looking ' } };
  yield { event: 'tool-calling', data: { tool: 'recipes.read' } };
  yield { event: 'token', data: { chunk: 'Bolognesa.' } };
  yield { event: 'done', data: { finishReason: 'stop' } };
}

async function* errorReply(): AsyncIterable<ChatSseEvent> {
  yield {
    event: 'error',
    data: { code: 'HERMES_TIMEOUT', message: 'agent timed out' },
  };
}

const baseProps = {
  agentEnabled: true,
  organizationId: 'org-1',
  userId: 'user-1',
  onSend: () => doneOnly(),
};

describe('AgentChatWidget — flag-disabled smoke', () => {
  it('renders nothing when agentEnabled=false', () => {
    const { container } = render(
      <AgentChatWidget {...baseProps} agentEnabled={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AgentChatWidget — closed → open', () => {
  it('renders only the FAB while closed', () => {
    render(<AgentChatWidget {...baseProps} />);
    expect(screen.getByRole('button', { name: /open agent chat/i })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking the FAB opens the sidesheet and focuses the input', async () => {
    const user = userEvent.setup();
    render(<AgentChatWidget {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Message');
    });
  });

  it('Esc closes the sidesheet and returns focus to the FAB', async () => {
    const user = userEvent.setup();
    render(<AgentChatWidget {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Open agent chat');
  });
});

describe('AgentChatWidget — streaming + tool-calling', () => {
  it('appends tokens incrementally to the agent bubble', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => tokensThenDone('Hola'));
    render(<AgentChatWidget {...baseProps} onSend={onSend as () => AsyncIterable<ChatSseEvent>} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    await user.type(screen.getByLabelText('Message'), 'ping');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByRole('log').textContent).toContain('Hola');
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    const req = onSend.mock.calls[0][0] as SendRequest;
    expect(req.message.type).toBe('text');
    if (req.message.type === 'text') {
      expect(req.message.content).toBe('ping');
    }
  });

  it('renders an inline tool-call note then resumes streaming', async () => {
    const user = userEvent.setup();
    render(
      <AgentChatWidget
        {...baseProps}
        onSend={() => toolCallThenAnswer()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    await user.type(screen.getByLabelText('Message'), 'show recipe');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByRole('log').textContent).toContain('Bolognesa.');
    });
    // After the final token, the toolNote is cleared (only the latest tool
    // call is shown, and a token resets it).
    expect(screen.getByRole('log').textContent).not.toContain('Calling recipes.read');
  });

  it('surfaces error events as inline alerts', async () => {
    const user = userEvent.setup();
    render(<AgentChatWidget {...baseProps} onSend={() => errorReply()} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    await user.type(screen.getByLabelText('Message'), 'hi');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('agent timed out');
    });
  });
});

describe('AgentChatWidget — multimodal (image)', () => {
  it('drag-drop attaches an image preview before send', async () => {
    const user = userEvent.setup();
    render(<AgentChatWidget {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));

    const dialog = screen.getByRole('dialog');
    const file = new File(['fake-png-bytes'], 'pic.png', { type: 'image/png' });

    fireEvent.drop(dialog, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      const previews = dialog.querySelectorAll('img[alt="attached"]');
      expect(previews.length).toBe(1);
    });
  });

  it('rejects unsupported mime types with an inline error', async () => {
    const user = userEvent.setup();
    render(<AgentChatWidget {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));

    const dialog = screen.getByRole('dialog');
    const file = new File(['x'], 'a.svg', { type: 'image/svg+xml' });
    fireEvent.drop(dialog, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/unsupported image type/i);
    });
  });
});

describe('AgentChatWidget — empty input is a no-op', () => {
  it('Send button is disabled when there is no text and no image', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => doneOnly());
    render(<AgentChatWidget {...baseProps} onSend={onSend as () => AsyncIterable<ChatSseEvent>} />);
    await user.click(screen.getByRole('button', { name: /open agent chat/i }));
    const sendBtn = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    await user.click(sendBtn);
    expect(onSend).not.toHaveBeenCalled();
  });
});
