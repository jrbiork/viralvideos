'use client';

interface BreadcrumbProps {
  items: {
    label: string;
    href?: string;
  }[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex items-center justify-center space-x-2 text-sm">
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && <span className="text-gray-500 mx-2">/</span>}
          <span className="text-white font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
