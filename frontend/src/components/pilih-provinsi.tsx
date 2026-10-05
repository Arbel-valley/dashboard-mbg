"use client";

import { Select } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { useWilayah } from "@/lib/hooks";
import { NODE, NODE_WILAYAH } from "@/lib/node";

/** Select provinsi yang dikelompokkan per node, supaya lokasi penyimpanan terlihat saat memilih. */
export function PilihProvinsi({
  id,
  value,
  onChange,
  labelSemua,
  required,
}: {
  id?: string;
  value: string;
  onChange: (kode: string) => void;
  labelSemua?: string;
  required?: boolean;
}) {
  const { data, error } = useWilayah();
  return (
    <>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!data} required={required}>
        {labelSemua !== undefined ? (
          <option value="">{labelSemua}</option>
        ) : (
          <option value="" disabled>
            {data ? "Pilih provinsi" : "Memuat provinsi..."}
          </option>
        )}
        {NODE_WILAYAH.map((n) => (
          <optgroup key={n} label={`Node ${NODE[n].nama.toLowerCase()}: ${NODE[n].wilayah}`}>
            {data?.baris
              .filter((w) => w.node === n)
              .map((w) => (
                <option key={w.kode_provinsi} value={w.kode_provinsi}>
                  {w.nama_provinsi} ({w.kode_provinsi})
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      {error ? (
        <p className="text-xs text-bahaya">
          {error instanceof ApiError && error.status === 404 ? (
            <>
              Backend belum punya endpoint <code>/referensi/wilayah</code>. Perbarui <code>backend/app/main.py</code>,
              lalu <code>docker compose restart backend</code>.
            </>
          ) : (
            "Daftar provinsi belum bisa dimuat."
          )}
        </p>
      ) : null}
    </>
  );
}
