"use client";

const variables = [

"{customer_name}",

"{phone_number}",

"{campaign_name}",

"{loan_amount}",

"{company_name}",

"{current_date}",

];

export default function PromptVariables() {

return (

<div>

<h3 className="font-semibold mb-2">

Variables

</h3>

<div className="flex flex-wrap gap-2">

{variables.map(variable=>(

<span

key={variable}

className="rounded bg-gray-100 px-2 py-1 text-xs"

>

{variable}

</span>

))}

</div>

</div>

);

}