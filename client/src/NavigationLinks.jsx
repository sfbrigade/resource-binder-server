import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { Alert, Anchor, Avatar, Group, Menu, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import Api from './Api';
import { useAuthContext } from './AuthContext';

export default function NavigationLinks ({ close, mobile = false }) {
  const { user, setUser } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [logoutComplete, setLogoutComplete] = useState(false);
  const logout = useMutation({
    mutationFn: () => Api.auth.logout(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      navigate('/', { replace: true });
      setLogoutComplete(true);
    },
  });

  useEffect(() => {
    // Leave protected routes before clearing authentication; otherwise their
    // redirect can race the transition to the signed-out home page.
    if (logoutComplete && location.pathname === '/') {
      queryClient.clear();
      queryClient.setQueryData(['users', 'me'], null);
      setUser(null);
      setLogoutComplete(false);
      close();
    }
  }, [logoutComplete, location.pathname, queryClient, setUser, close]);

  useEffect(() => logout.reset(), [user?.id, logout.reset]);
  const Layout = mobile ? Stack : Group;

  return (
    <Layout {...(mobile ? { p: 'md', gap: 'md' } : { visibleFrom: 'sm', gap: 'xl' })}>
      <Anchor component={NavLink} to='/' onClick={close}>Home</Anchor>
      {user
        ? (
          <>
            {user.isAdmin && (mobile
              ? (
                <>
                  <Anchor component={NavLink} to='/admin/invites' onClick={close}>Invites</Anchor>
                  <Anchor component={NavLink} to='/admin/users' onClick={close}>Users</Anchor>
                </>
                )
              : (
                <Menu trigger='hover' transitionProps={{ exitDuration: 0 }} withinPortal>
                  <Menu.Target>
                    <Anchor component={NavLink} to='/admin' onClick={close}>Admin</Anchor>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item component={Link} to='/admin/invites' onClick={close}>Invites</Menu.Item>
                    <Menu.Item component={Link} to='/admin/users' onClick={close}>Users</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                ))}
            <Group gap='xs'>
              <span>Hello, <Anchor component={NavLink} to='/account' onClick={close}>{user.firstName}!</Anchor></span>
              {user.pictureUrl && <Avatar src={user.pictureUrl} />}
            </Group>
            <Anchor component='button' type='button' disabled={logout.isPending || logoutComplete} onClick={() => logout.mutate()}>
              {logout.isPending || logoutComplete ? 'Logging out…' : 'Log out'}
            </Anchor>
          </>
          )
        : <Anchor component={NavLink} to='/login' onClick={close}>Log in</Anchor>}
      {logout.error && (
        <Alert
          {...(mobile ? {} : { pos: 'absolute', top: '100%', left: 0, right: 0 })}
          color='red'
          withCloseButton
          onClose={() => logout.reset()}
        >
          {logout.error._form || 'Unable to log out. Please try again.'}
        </Alert>
      )}
    </Layout>
  );
}
