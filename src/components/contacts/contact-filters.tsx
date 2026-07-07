"use client";

import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

export default function ContactFilters(){

return(

<div
className="flex gap-3">

<Input

placeholder="Search contacts..."

/>

<select
className="border rounded p-2">

<option>

All Languages

</option>

<option>

English

</option>

<option>

Hindi

</option>

<option>

Marathi

</option>

</select>

<select
className="border rounded p-2">

<option>

All Status

</option>

<option>

Pending

</option>

<option>

Called

</option>

<option>

Answered

</option>

</select>

<Button>

Search

</Button>

</div>

);

}