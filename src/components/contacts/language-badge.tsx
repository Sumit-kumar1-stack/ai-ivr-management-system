import { Badge } from "@/components/ui/badge";

export default function LanguageBadge({
    language,
}:{
    language:string;
}){

return(

<Badge
variant="secondary"
>

{language}

</Badge>

);

}