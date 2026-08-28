import { Badge } from "@/components/ui/badge";

interface Props {
    status: string;
}

const variantMap: Record<string, string> = {
    PENDING: "bg-yellow-500",
    CALLED: "bg-blue-500",
    ANSWERED: "bg-green-500",
    FAILED: "bg-red-500",
    BLOCKED: "bg-gray-500",
};

export default function StatusBadge({
    status,
}: Props) {

    return (

        <Badge
            className={
                variantMap[status]
            }
        >
            {status}
        </Badge>

    );

}