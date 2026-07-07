import { asyncHandler } from "@/lib/async-handler";

import { success } from "@/lib/api-response";

import { ContactService } from "@/features/contacts/contact.service";

export const PUT = asyncHandler(async(req,{params})=>{

const body=
await req.json();

await ContactService.updateContact(
params.id,
body
);

return success(
{},
"Updated successfully"
);

});

export const DELETE = asyncHandler(async(req,{params})=>{

await ContactService.deleteContact(
params.id
);

return success(
{},
"Deleted successfully"
);

});