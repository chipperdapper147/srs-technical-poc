import type { SelectVM } from "@app/client";
import { NativeSelect } from "@/components/native-select";
import { Label } from "@/components/ui/label";

export function SelectField<T extends string>({
  field,
  onChange,
}: {
  field: SelectVM<T>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.id}>{field.label}</Label>
      <NativeSelect
        id={field.id}
        value={field.value}
        onChange={(e) => {
          const option = field.options.find((o) => o.value === e.target.value);
          if (option) onChange(option.value);
        }}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
