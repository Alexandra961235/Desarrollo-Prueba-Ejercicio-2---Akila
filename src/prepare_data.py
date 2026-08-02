"""ETL y validaciones del archivo de apartamentos, sin dependencias externas."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "raw" / "apartamentos_akila.csv"
OUTPUT_DIR = ROOT / "data" / "processed"

FIELDS = [
    "id", "torre", "piso", "numero_puerta", "apartamento", "tipo_apartamento",
    "area_m2", "precio_cop", "estado", "fecha_venta", "fecha_entrega",
    "forma_pago", "porcentaje_credito", "monto_credito_cop", "monto_contado_cop",
]
TYPES = {"Apartaestudio", "1 Alcoba", "2 Alcobas", "3 Alcobas", "Penthouse"}
STATES = {"Vendido", "Disponible"}
PAYMENTS = {"Contado", "Crédito"}
SALE_FIELDS = {
    "fecha_venta", "forma_pago", "porcentaje_credito", "monto_credito_cop",
    "monto_contado_cop",
}


def iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def integer(value: str) -> int:
    if not re.fullmatch(r"-?\d+", value.strip()):
        raise ValueError("no es un entero")
    return int(value)


def decimal(value: str) -> Decimal:
    try:
        return Decimal(value.strip())
    except InvalidOperation as exc:
        raise ValueError("no es numérico") from exc


def monday(value: date) -> date:
    return value - timedelta(days=value.weekday())


def add_issue(issues: list[dict], row: int | None, field: str, severity: str, message: str) -> None:
    issues.append({"row": row, "field": field, "severity": severity, "message": message})


def prepare(input_path: Path = INPUT, output_dir: Path = OUTPUT_DIR) -> dict:
    issues: list[dict] = []
    clean: list[dict] = []

    with input_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = [field for field in FIELDS if field not in (reader.fieldnames or [])]
        extra = [field for field in (reader.fieldnames or []) if field not in FIELDS]
        if missing:
            raise ValueError(f"Faltan columnas obligatorias: {', '.join(missing)}")
        if extra:
            add_issue(issues, None, "schema", "warning", f"Columnas extra: {', '.join(extra)}")

        for line_number, raw in enumerate(reader, start=2):
            row = {key: (raw.get(key) or "").strip() for key in FIELDS}
            parsed: dict = dict(row)
            failed = False

            for field in ("id", "piso", "numero_puerta"):
                try:
                    parsed[field] = integer(row[field])
                    if parsed[field] <= 0:
                        raise ValueError("debe ser mayor que cero")
                except ValueError as exc:
                    add_issue(issues, line_number, field, "error", str(exc)); failed = True

            for field in ("area_m2", "precio_cop"):
                try:
                    parsed[field] = decimal(row[field])
                    if parsed[field] <= 0:
                        raise ValueError("debe ser mayor que cero")
                except ValueError as exc:
                    add_issue(issues, line_number, field, "error", str(exc)); failed = True

            try:
                parsed["fecha_entrega"] = iso_date(row["fecha_entrega"])
            except ValueError:
                add_issue(issues, line_number, "fecha_entrega", "error", "fecha ISO inválida"); failed = True

            if row["tipo_apartamento"] not in TYPES:
                add_issue(issues, line_number, "tipo_apartamento", "error", "tipo no permitido"); failed = True
            if row["estado"] not in STATES:
                add_issue(issues, line_number, "estado", "error", "estado no permitido"); failed = True

            if row["estado"] == "Vendido":
                try:
                    parsed["fecha_venta"] = iso_date(row["fecha_venta"])
                except ValueError:
                    add_issue(issues, line_number, "fecha_venta", "error", "fecha requerida o inválida"); failed = True
                if row["forma_pago"] not in PAYMENTS:
                    add_issue(issues, line_number, "forma_pago", "error", "forma de pago requerida o inválida"); failed = True
                for field in ("porcentaje_credito", "monto_credito_cop", "monto_contado_cop"):
                    try:
                        parsed[field] = decimal(row[field])
                    except ValueError as exc:
                        add_issue(issues, line_number, field, "error", str(exc)); failed = True

                if not failed:
                    pct = parsed["porcentaje_credito"]
                    credit = parsed["monto_credito_cop"]
                    cash = parsed["monto_contado_cop"]
                    price = parsed["precio_cop"]
                    if not Decimal("0") <= pct <= Decimal("100"):
                        add_issue(issues, line_number, "porcentaje_credito", "error", "fuera de 0–100")
                    if row["forma_pago"] == "Contado" and (pct != 0 or credit != 0):
                        add_issue(issues, line_number, "forma_pago", "error", "contado debe tener crédito en cero")
                    if row["forma_pago"] == "Crédito" and pct <= 0:
                        add_issue(issues, line_number, "porcentaje_credito", "error", "crédito debe ser mayor que cero")
                    if credit + cash != price:
                        add_issue(issues, line_number, "precio_cop", "error", "crédito + contado no coincide con precio")
                    expected = (price * pct / 100).quantize(Decimal("100000"))
                    if abs(credit - expected) > Decimal("100000"):
                        add_issue(issues, line_number, "monto_credito_cop", "warning", "no concuerda con el porcentaje (tolerancia $100.000)")
            elif row["estado"] == "Disponible":
                for field in SALE_FIELDS:
                    if row[field]:
                        add_issue(issues, line_number, field, "error", "debe estar vacío para Disponible")
                parsed.update({field: None for field in SALE_FIELDS})

            if not failed:
                expected_name = f"{row['torre']} Apto {parsed['piso']}{parsed['numero_puerta']:02d}"
                if row["apartamento"] != expected_name:
                    add_issue(issues, line_number, "apartamento", "warning", f"no coincide con ubicación; esperado: {expected_name}")
                clean.append(parsed)

    ids = defaultdict(list)
    apartments = defaultdict(list)
    for row in clean:
        ids[row["id"]].append(row["id"])
        apartments[row["apartamento"]].append(row["id"])
    for value, occurrences in ids.items():
        if len(occurrences) > 1:
            add_issue(issues, None, "id", "error", f"id duplicado: {value}")
    duplicate_apartments = {key: value for key, value in apartments.items() if len(value) > 1}
    for value, occurrences in duplicate_apartments.items():
        add_issue(issues, None, "apartamento", "warning", f"apartamento repetido: {value} (ids: {', '.join(map(str, occurrences))})")

    sold = [row for row in clean if row["estado"] == "Vendido"]
    available = [row for row in clean if row["estado"] == "Disponible"]
    weekly_count: Counter[str] = Counter()
    weekly_value: Counter[str] = Counter()
    for row in sold:
        week = monday(row["fecha_venta"]).isoformat()
        weekly_count[week] += 1
        weekly_value[week] += row["precio_cop"]

    type_totals = Counter(row["tipo_apartamento"] for row in clean)
    sold_types = Counter(row["tipo_apartamento"] for row in sold)
    tower_totals = Counter(row["torre"] for row in clean)
    tower_sold = Counter(row["torre"] for row in sold)
    type_rows = [{
        "type": kind,
        "total": type_totals[kind],
        "sold": sold_types[kind],
        "available": type_totals[kind] - sold_types[kind],
        "share": round(sold_types[kind] / len(sold) * 100, 1) if sold else 0,
    } for kind in sorted(type_totals)]
    tower_rows = [{
        "tower": tower,
        "total": tower_totals[tower],
        "sold": tower_sold[tower],
        "available": tower_totals[tower] - tower_sold[tower],
    } for tower in sorted(tower_totals)]

    output = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "kpis": {
            "total": len(clean), "sold": len(sold), "available": len(available),
            "product_types": len(type_totals),
            "sold_value": int(sum(row["precio_cop"] for row in sold)),
            "available_value": int(sum(row["precio_cop"] for row in available)),
        },
        "weekly": [{"week": week, "count": weekly_count[week], "value": int(weekly_value[week])} for week in sorted(weekly_count)],
        "types": type_rows,
        "towers": tower_rows,
        "sold_units": [{
            "id": row["id"],
            "tower": row["torre"],
            "type": row["tipo_apartamento"],
            "area": float(row["area_m2"]),
            "price": int(row["precio_cop"]),
            "sale_date": row["fecha_venta"].isoformat(),
            "payment": row["forma_pago"],
            "credit_pct": float(row["porcentaje_credito"]),
            "credit_amount": int(row["monto_credito_cop"]),
            "cash_amount": int(row["monto_contado_cop"]),
        } for row in sold],
        "quality": {
            "errors": sum(item["severity"] == "error" for item in issues),
            "warnings": sum(item["severity"] == "warning" for item in issues),
            "duplicate_apartment_names": len(duplicate_apartments),
            "unique_apartment_names": len(apartments),
            "issues": issues,
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "quality_report.json").write_text(json.dumps(output["quality"], ensure_ascii=False, indent=2), encoding="utf-8")
    with (output_dir / "apartamentos_limpios.csv").open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=FIELDS)
        writer.writeheader()
        for row in clean:
            writer.writerow({key: "" if value is None else value.isoformat() if isinstance(value, date) else value for key, value in row.items()})

    dashboard_data = ROOT / "dashboard" / "data"
    dashboard_data.mkdir(parents=True, exist_ok=True)
    (dashboard_data / "summary.json").write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    return output


if __name__ == "__main__":
    result = prepare()
    print(f"Filas procesadas: {result['kpis']['total']}")
    print(f"Errores: {result['quality']['errors']} | Advertencias: {result['quality']['warnings']}")
