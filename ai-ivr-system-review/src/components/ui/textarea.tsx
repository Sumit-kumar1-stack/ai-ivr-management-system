"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<
HTMLTextAreaElement,
TextareaProps
>(({ className, ...props }, ref) => {

return (

<textarea

ref={ref}

className={cn(

"flex min-h-[160px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary",

className

)}

{...props}

/>

);

});

Textarea.displayName="Textarea";

export { Textarea };