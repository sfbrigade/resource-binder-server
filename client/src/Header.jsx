import { useEffect } from 'react';
import { Link } from 'react-router';
import { StatusCodes } from 'http-status-codes';
import { Burger, Container, Group, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';

import Api from './Api';
import { useAuthContext } from './AuthContext';
import NavigationLinks from './NavigationLinks';

function Header ({ opened, close, toggle }) {
  const { setUser } = useAuthContext();

  const { data, isSuccess } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => Api.users.me().then((response) => response.status === StatusCodes.OK ? response.data : null),
  });

  useEffect(
    function () {
      if (isSuccess) {
        setUser(data);
      }
    },
    [data, isSuccess, setUser]
  );

  return (
    <Container h='100%'>
      <Group h='100%' align='center' justify='space-between'>
        <Link to='/' onClick={close}>
          <Title size='xl'>Full Stack Starter</Title>
        </Link>
        <NavigationLinks close={close} />
        <Burger aria-label={opened ? 'Close navigation' : 'Open navigation'} opened={opened} onClick={toggle} hiddenFrom='sm' size='sm' />
      </Group>
    </Container>
  );
}

export default Header;
