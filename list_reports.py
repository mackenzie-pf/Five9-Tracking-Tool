"""
list_reports.py — permission diagnostic.
Tests which API operations the current account can perform.

Run with:
    python list_reports.py
"""

from zeep import Client
from zeep.transports import Transport
from zeep.helpers import serialize_object
from zeep.exceptions import Fault as ZeepFault
from requests import Session
from requests.auth import HTTPBasicAuth
from datetime import datetime
import config, json

def main():
    print(f"Connecting as: {config.FIVE9_USERNAME}\n")

    session = Session()
    session.auth = HTTPBasicAuth(config.FIVE9_USERNAME, config.FIVE9_PASSWORD)
    transport = Transport(session=session, timeout=60)
    wsdl_url = config.FIVE9_WSDL_URL.format(username=config.FIVE9_USERNAME)

    try:
        client = Client(wsdl_url, transport=transport)
        print("Connected OK.\n")
    except Exception as e:
        print(f"ERROR connecting: {e}\n")
        return

    service = client.service

    def test(label, fn):
        print(f"--- {label} ---")
        try:
            result = fn()
            data = serialize_object(result)
            text = json.dumps(data, indent=2, default=str)
            # Truncate long output
            if len(text) > 600:
                text = text[:600] + "\n  ... (truncated)"
            print(text)
        except ZeepFault as e:
            print(f"SOAP FAULT: {e}")
        except Exception as e:
            print(f"ERROR: {e}")
        print()

    test("getUsersGeneralInfo", lambda: service.getUsersGeneralInfo())
    test("getSkillsInfo",       lambda: service.getSkillsInfo())
    test("getCampaigns",        lambda: service.getCampaigns())
    test("getDispositions",     lambda: service.getDispositions())

    # Try runReport directly with exact fault message
    print("--- runReport (raw fault) ---")
    try:
        start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end   = datetime.now()
        time_type     = client.get_type("ns0:reportTimeCriteria")
        criteria_type = client.get_type("ns0:customReportCriteria")
        identifier = service.runReport(
            folderName=config.FIVE9_REPORT_FOLDER,
            reportName=config.FIVE9_REPORT_NAME,
            criteria=criteria_type(time=time_type(start=start, end=end)),
        )
        print(f"OK — identifier: {identifier}")
    except ZeepFault as e:
        print(f"SOAP FAULT CODE:    {e.code}")
        print(f"SOAP FAULT MESSAGE: {e.message}")
        print(f"SOAP FAULT DETAIL:  {e.detail}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    main()
