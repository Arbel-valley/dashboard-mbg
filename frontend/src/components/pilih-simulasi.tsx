import { Field, Select } from "@/components/ui/field";

export const OPSI_SIMULASI = [
  { nilai: "", label: "Normal, tanpa gangguan" },
  { nilai: "gagal_prepare", label: "Peserta menolak PREPARE (vote NO)" },
  { nilai: "crash_sebelum_keputusan", label: "Koordinator mati sebelum memutuskan" },
  { nilai: "crash_setelah_keputusan", label: "Koordinator mati di tengah fase commit" },
] as const;

/** Pilihan gangguan untuk mendemonstrasikan perilaku two-phase commit. */
export function PilihSimulasi({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label="Mode demo 2PC"
      htmlFor={id}
      bantuan={value ? "Gangguan disengaja untuk demo." : undefined}
    >
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {OPSI_SIMULASI.map((o) => (
          <option key={o.nilai} value={o.nilai}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
