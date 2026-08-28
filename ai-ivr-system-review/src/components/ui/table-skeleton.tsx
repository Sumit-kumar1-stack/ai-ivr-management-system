export default function TableSkeleton({
  rows = 8,
}: {
  rows?: number;
}) {
  return (
    <div className="rounded-lg border overflow-hidden animate-pulse">
      <table className="w-full">
        <thead className="bg-gray-100">
          <tr>
            {Array.from({ length: 7 }).map((_, i) => (
              <th key={i} className="p-4">
                <div className="h-4 w-24 rounded bg-gray-300" />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row} className="border-t">
              {Array.from({ length: 7 }).map((_, col) => (
                <td key={col} className="p-4">
                  <div className="h-4 rounded bg-gray-200" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}