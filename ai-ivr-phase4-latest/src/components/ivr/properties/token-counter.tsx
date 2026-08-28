"use client";

interface Props {
  prompt: string;
}

export default function TokenCounter({
  prompt,
}: Props) {

const words = prompt
.trim()
.split(/\s+/)
.filter(Boolean).length;

const estimatedTokens =
Math.ceil(words * 1.3);

return (

<div
className="text-sm text-gray-500"
>

Estimated Tokens

:

<strong>

{estimatedTokens}

</strong>

</div>

);

}