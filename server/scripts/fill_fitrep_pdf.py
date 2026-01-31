#!/usr/bin/env python3
"""
Fill NAVPERS 1610/2 FITREP XFA PDF template with form data.
Usage: python3 fill_fitrep_pdf.py <template_path> <output_path>
Reads JSON form data from stdin.
"""
import sys
import json
import pikepdf
import re


def fill_xfa_pdf(template_path: str, output_path: str, form_data: dict):
    pdf = pikepdf.open(template_path)
    root = pdf.Root
    acro = root["/AcroForm"]
    xfa = acro["/XFA"]

    # XFA array: [label, stream, label, stream, ...]
    # Find datasets stream (label "datasets" at index 8, stream at index 9)
    datasets_idx = None
    for i in range(0, len(xfa), 2):
        label = str(xfa[i])
        if label == "datasets":
            datasets_idx = i + 1
            break

    if datasets_idx is None:
        raise ValueError("Could not find datasets in XFA")

    datasets_stream = xfa[datasets_idx]
    xml_data = datasets_stream.read_bytes().decode("utf-8")

    # Build field mapping from app form data to XFA field names
    field_map = build_field_map(form_data)

    # Replace each field value in the XML
    for xfa_field, value in field_map.items():
        if value is None or value == "":
            continue
        tag = xfa_field
        filled = f"<{tag}>{escape_xml(str(value))}</{tag}>"

        # First try replacing existing value elements <_field>old</_field>
        existing_pattern = re.compile(f"<{re.escape(tag)}\n?>.*?</{re.escape(tag)}\n?>", re.DOTALL)
        if existing_pattern.search(xml_data):
            xml_data = existing_pattern.sub(filled, xml_data)
        else:
            # Replace empty element <_field\n/>
            empty_pattern = f"<{tag}\n/>"
            xml_data = xml_data.replace(empty_pattern, filled)

    # Write updated XML back to the stream
    datasets_stream.write(xml_data.encode("utf-8"))
    pdf.save(output_path)
    pdf.close()


def escape_xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_field_map(form: dict) -> dict:
    """Map frontend form field names to XFA field names."""
    m = {}

    # Text fields
    m["_1_Name_Last__First_MI_Suffix"] = form.get("rateeName", "")
    m["_2_GradeRate"] = form.get("gradeRate", "")
    m["_3_Desig"] = form.get("desig", "")
    m["_4_SSN"] = form.get("ssn", "")
    m["_6_UIC"] = form.get("uic", "")
    m["_7_ShipStation"] = form.get("shipStation", "")
    m["_8_Promotion_Status"] = form.get("promotionStatus", "")
    m["_9_Date_Reported"] = form.get("dateReported", "")
    m["_14_PeriodDate_From"] = form.get("periodFrom", "")
    m["_15_PeriodDate_To"] = form.get("periodTo", "")
    m["_20_Physical_Readiness"] = form.get("physicalReadiness", "")
    m["_21_Billet"] = form.get("billet", "")
    m["_22_Reporting_Senior_Last__FI_MI"] = form.get("reportingSeniorName", "")
    m["_23_Grade_Rpt_Sr"] = form.get("reportingSeniorGrade", "")
    m["_24_Desig_Rpt_Sr"] = form.get("reportingSeniorDesig", "")
    m["_25_Title_Rpt_Sr"] = form.get("reportingSeniorTitle", "")
    m["_26_UIC_Rpt_Sr"] = form.get("reportingSeniorUIC", "")
    m["_28_Command_achievements"] = form.get("commandEmployment", "")
    m["_29_PrimaryCollat"] = form.get("primaryDuties", "")
    m["_30_Date_Counsel"] = form.get("dateCounseled", "")
    m["_31_Counselor"] = form.get("counselor", "")
    m["_32_Ind_Sig_Counseled"] = form.get("individualSignature", "")
    m["_41_Comments_on_Perf"] = form.get("performanceComments", "")
    m["_44_Rpt_Sr_Address"] = form.get("summarySignProblem", "")
    m["_45_Rpt_Sr_Sign_Date"] = form.get("reportingSeniorSignDate", "")
    m["_47_Reg_Rpt_Sr_Sig"] = form.get("regularReportingSenior", "")
    m["_47_Date"] = form.get("regularReportingSeniorDate", "")

    # Status checkbox (exclusive group) - set the value that represents the selection
    status = form.get("status", "")
    status_map = {"ACT": "1", "FTS": "2", "INACT": "3"}
    m["_5_Status"] = status_map.get(status, "")

    # Report occasion checkboxes
    occasion = form.get("occasion", "")
    m["_10_Periodic"] = "1" if occasion == "Periodic" else "0"
    m["_11_Detach_ind"] = "1" if occasion == "Detach Individual" else "0"
    m["_12_Detach_Sr"] = "1" if occasion == "Detach Senior" else "0"
    m["_13_Special"] = "1" if occasion == "Special" else "0"

    # NOB checkbox
    m["_16_NOB"] = "1" if form.get("notObserved") else "0"

    # Report type checkboxes
    report_type = form.get("reportType", "")
    m["_17_Report_Regular"] = "1" if report_type == "Regular" else "0"
    m["_18_Report_Concurrent"] = "1" if report_type == "Concurrent" else "0"
    m["_19_Report_OpsCDR"] = "1" if report_type == "Ops Cdr" else "0"

    # Performance traits - map numeric values to trait scores
    trait_map = {
        "leadership": "_33_Leadership",
        "institutionalExpertise": "_34_InstExpertise",
        "professionalism": "_35_Professionalism",
        "loyalty": "_36_Loyalty",
        "character": "_37_Character",
        "communication": "_38_Communication",
        "heritage": "_39_Heritage",
    }
    for form_key, xfa_key in trait_map.items():
        val = form.get(form_key)
        if val == "NOB":
            m[xfa_key] = "NOB"
        elif val is not None and val != "":
            m[xfa_key] = str(val)

    # Recommendation
    rec = form.get("recommendation", "")
    rec_map = {
        "NOB": "_42_NOB",
        "Significant Problems": "_42_Sig_Problems",
        "Progressing": "_42_Progressing",
        "Promotable": "_42_Promotable",
        "Must Promote": "_42_Must_Promote",
        "Early Promote": "_42_Early_Promote",
    }
    # For exclusive group, set the selected one
    m["_42_Recommendation"] = rec

    # Summary group markers
    m["_43_Summary_Sig_Problem"] = "X" if rec == "Significant Problems" else ""
    m["_43_Summary_Progressing"] = "X" if rec == "Progressing" else ""
    m["_43_Summary_Promotable"] = "X" if rec == "Promotable" else ""
    m["_43_Summary_Must_Promote"] = "X" if rec == "Must Promote" else ""
    m["_43_Summary_Early_Promote"] = "X" if rec == "Early Promote" else ""

    # Compute trait average
    trait_vals = []
    for form_key in trait_map:
        val = form.get(form_key)
        if isinstance(val, (int, float)):
            trait_vals.append(float(val))
        elif isinstance(val, str) and val.replace(".", "").isdigit():
            trait_vals.append(float(val))
    if trait_vals:
        avg = sum(trait_vals) / len(trait_vals)
        m["Member_Trait_Avg"] = f"{avg:.2f}"

    return m


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: fill_fitrep_pdf.py <template_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    template_path = sys.argv[1]
    output_path = sys.argv[2]
    form_data = json.load(sys.stdin)
    fill_xfa_pdf(template_path, output_path, form_data)
    print(json.dumps({"success": True, "output": output_path}))
