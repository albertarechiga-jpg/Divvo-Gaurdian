// Shipments (mock in src/data/shipments.js, live in dashboard_shipments)
// store the customer's display NAME, and the pages match them to a company by
// comparing it with companies.name. Renaming a customer would therefore make
// its shipments, alerts and incidents vanish until every stored row is
// updated. This lets a renamed customer keep matching under its old and new
// name, so the code deploy and the database rename (pilot_rename_sony.sql)
// can happen in either order.
//
// Remove the alias once pilot_rename_sony.sql has been run everywhere.
const NAME_ALIASES = {
  owlet: ["Owlet", "Sony"], // company id stays "owlet"; display name is now "Sony"
};

export function shipmentBelongsToCompany(shipment, companyInfo) {
  if (!companyInfo || !shipment) return false;
  if (shipment.customer === companyInfo.name) return true;
  return (NAME_ALIASES[companyInfo.id] || []).includes(shipment.customer);
}
