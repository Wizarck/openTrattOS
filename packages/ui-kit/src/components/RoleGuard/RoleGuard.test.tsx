import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGuard } from './RoleGuard';

describe('RoleGuard', () => {
  it('renders children when currentRole matches the required role (string form)', () => {
    render(
      <RoleGuard role="OWNER" currentRole="OWNER">
        <div>secret</div>
      </RoleGuard>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('renders fallback (default null) when currentRole does not match', () => {
    const { container } = render(
      <RoleGuard role="OWNER" currentRole="MANAGER">
        <div>secret</div>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('renders the fallback prop when provided', () => {
    render(
      <RoleGuard role="OWNER" currentRole="STAFF" fallback={<div>nope</div>}>
        <div>secret</div>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('nope')).toBeInTheDocument();
  });

  it('matches any-of when role is passed as an array', () => {
    const { rerender } = render(
      <RoleGuard role={['OWNER', 'MANAGER']} currentRole="MANAGER">
        <div>shared</div>
      </RoleGuard>,
    );
    expect(screen.getByText('shared')).toBeInTheDocument();

    rerender(
      <RoleGuard role={['OWNER', 'MANAGER']} currentRole="STAFF">
        <div>shared</div>
      </RoleGuard>,
    );
    expect(screen.queryByText('shared')).not.toBeInTheDocument();
  });

  it('always renders the fallback when currentRole is null (no signed-in user)', () => {
    render(
      <RoleGuard role="OWNER" currentRole={null} fallback={<div>signed out</div>}>
        <div>secret</div>
      </RoleGuard>,
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });
});
