"use client";

import { Button } from "@/components/ui/button";

interface Props{

id:string;

}

export default function ContactActions({

id,

}:Props){

return(

<div className="flex gap-2">

<Button
size="sm"
>

Edit

</Button>

<Button
size="sm"
variant="destructive"
>

Delete

</Button>

</div>

);

}