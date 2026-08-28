"use client";

import { useUsers } from "@/features/users/use-users";

import { StatusBadge } from "./status-badge";

import { RoleBadge } from "./role-badge";

export default function UserTable() {

const {data,isLoading}=useUsers();

if(isLoading){

return <p>Loading...</p>;

}

return(

<table className="w-full border">

<thead>

<tr>

<th>Name</th>

<th>Email</th>

<th>Role</th>

<th>Status</th>

</tr>

</thead>

<tbody>

{data?.map(user=>(

<tr key={user.id}>

<td>{user.fullName}</td>

<td>{user.email}</td>

<td>

<RoleBadge role={user.role}/>

</td>

<td>

<StatusBadge active={user.isActive}/>

</td>

</tr>

))}

</tbody>

</table>

);

}