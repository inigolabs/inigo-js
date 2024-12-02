import React from "react";
import Link from "next/link";
import queryGraphql from "../shared/query-graphql";

const getUsers = async () => {
  const { users } = await queryGraphql(`
    query {
      users {
        name
        username
      }
    }
  `);

  return users as { username: string; name: string }[];
};

export default async function UserListing() {
  const users = await getUsers();

  return (
    <div>
      <h1>User Listing</h1>
      <ul>
        {users.map((user) => (
          <li key={user.username}>
            <Link href="/[username]" as={`/${user.username}`}>
              {user.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
