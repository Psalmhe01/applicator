import { type Status, statuses } from './model';
import { Field } from './components/ui';

export default function ApplicationStatus({
  value,
  onChange,
}: {
  value: Status;
  onChange: (value: Status) => void;
}) {
  return (
    <div className="application-status-control">
      <Field label="Application status">
        <select value={value} onChange={(event) => onChange(event.currentTarget.value as Status)}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
