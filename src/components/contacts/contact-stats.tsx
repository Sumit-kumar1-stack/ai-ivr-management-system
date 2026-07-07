"use client";

import { Card } from "@/components/ui/card";

export default function ContactStats(){

return(

<div
className="grid grid-cols-4 gap-5">

<Card
className="p-5">

<h3>Total</h3>

<h1>

520

</h1>

</Card>

<Card
className="p-5">

<h3>Pending</h3>

<h1>

240

</h1>

</Card>

<Card
className="p-5">

<h3>Called</h3>

<h1>

200

</h1>

</Card>

<Card
className="p-5">

<h3>Failed</h3>

<h1>

80

</h1>

</Card>

</div>

);

}