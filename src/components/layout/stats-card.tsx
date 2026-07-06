type Props = {
  title: string;
  value: string | number;
};

export default function StatsCard({
  title,
  value,
}: Props) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">
        {title}
      </p>

      <h2 className="text-2xl font-bold mt-2">
        {value}
      </h2>
    </div>
  );
}