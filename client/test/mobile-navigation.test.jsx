import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { createHead, UnheadProvider } from '@unhead/react/client';

import App from '../src/App';
import Api from '../src/Api';
import StaticContextProvider from '../src/StaticContextProvider';

vi.mock('../src/Api', () => ({ default: { auth: { logout: vi.fn() }, users: { me: vi.fn(), get: vi.fn() } } }));

it('provides account, admin and logout actions in the mobile navigation', async () => {
  const profile = { id: 'admin', firstName: 'Admin', lastName: 'Check', email: 'admin@example.com', isAdmin: true, emailVerified: true, picture: null };
  Api.users.me.mockResolvedValue({ status: 200, data: profile });
  Api.users.get.mockResolvedValue({ status: 200, data: profile });
  Api.auth.logout.mockImplementation(async () => {
    Api.users.me.mockResolvedValue({ status: 204, data: null });
    return { data: { status: true } };
  });
  render(
    <StaticContextProvider value={{ authContext: { user: profile }, env: {} }}>
      <UnheadProvider head={createHead()}>
        <MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>
      </UnheadProvider>
    </StaticContextProvider>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const navigation = within(screen.getByRole('navigation', { hidden: true }));
  expect(navigation.getByRole('link', { name: 'Admin!' }).getAttribute('href')).toBe('/account');
  expect(navigation.getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/admin/users');
  expect(navigation.getByRole('link', { name: 'Invites' }).getAttribute('href')).toBe('/admin/invites');
  await user.click(navigation.getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('heading', { name: 'Home', exact: true })).toBeTruthy();
  await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
  expect(await navigation.findByRole('link', { name: 'Log in' })).toBeTruthy();
  expect(Api.auth.logout).toHaveBeenCalledTimes(1);
});
