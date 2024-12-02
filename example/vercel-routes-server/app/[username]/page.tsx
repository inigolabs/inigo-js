import React from "react";
import queryGraphql from "../../shared/query-graphql";

const getUser = async (username: string) => {
  const { user } = await queryGraphql(
    `
    query($username: String) {
      user(username: $username) {
        name
        username
      }
    }
  `,
    { username }
  );

  return user as { username: string; name: string };
};

export default async function UserProfile({ params }) {
  const { username } = await params;

  const user = await getUser(username);

  if (!user) {
    return <h1>User Not Found</h1>;
  }
  return (
    <h1>
      {user.username} is {user.name}
    </h1>
  );
}

export async function generateStaticParams() {
  const { users } = (await queryGraphql(`
    query {
      users {
        username
      }
    }
  `)) as { users: { username: string }[] };

  return users;
}
