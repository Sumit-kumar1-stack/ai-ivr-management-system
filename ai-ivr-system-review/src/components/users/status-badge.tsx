import { Badge } from "@/components/ui/badge";

export function StatusBadge({
    active,
}:{
    active:boolean;
}){

return (

<Badge>

{active?"Active":"Inactive"}

</Badge>

);

}