"use client";

import { useState } from "react";

import { useImportContacts } from "@/features/contacts/use-import-contacts";

export default function UploadCSV(){

const [file,setFile]=

useState<File>();

const mutation=

useImportContacts();

return(

<div>

<input

type="file"

accept=".csv"

onChange={(e)=>{

setFile(

e.target.files?.[0]

);

}}

/>

<button

onClick={()=>{

if(file){

mutation.mutate(file);

}

}}

>

Upload CSV

</button>

</div>

);

}