import ContactStats from "@/components/contacts/contact-stats";

import ContactFilters from "@/components/contacts/contact-filters";

import ContactTable from "@/components/contacts/contact-table";

import Pagination from "@/components/contacts/pagination";

import { Button } from "@/components/ui/button";

export default function ContactsPage(){

return(

<div
className="space-y-6">

<div
className="flex justify-between">

<h1
className="text-3xl font-bold">

Contacts

</h1>

<div
className="flex gap-3">

<Button>

Upload CSV

</Button>

<Button>

Add Contact

</Button>

</div>

</div>

<ContactStats/>

<ContactFilters/>

<ContactTable/>

<Pagination/>

</div>

);

}