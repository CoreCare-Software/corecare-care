const DEFAULT_TRAINING = [
  ['care-certificate','Care Certificate','Induction','Role induction and assessed Care Certificate standards.','role',['care'],null,true,false],
  ['safeguarding-adults','Safeguarding adults','Safety','Recognising, responding to and reporting abuse or neglect.','core',['all'],12,true,true],
  ['medication','Medication administration and competency','Clinical','Medication support, administration, recording and competency assessment.','role',['care','clinical'],12,true,true],
  ['moving-handling','Moving and handling','Safety','Safe moving, positioning, equipment and individual risk controls.','role',['care','clinical'],12,true,true],
  ['infection-control','Infection prevention and control','Safety','Infection prevention, PPE and outbreak controls.','core',['all'],12,true,false],
  ['first-aid','First aid and basic life support','Safety','Emergency response appropriate to the worker role.','role',['care','clinical'],12,true,true],
  ['mca-dols','Mental Capacity Act and least-restrictive practice','Care practice','Consent, capacity, best interests and least-restrictive support.','role',['care','clinical','management'],24,true,false],
  ['learning-disability-autism','Learning disability and autism','Care practice','Role-appropriate understanding and interaction skills.','core',['all'],24,true,false],
  ['health-safety','Health and safety','Safety','Workplace hazards, reporting and safe systems of work.','core',['all'],24,true,false],
  ['information-governance','Information governance and confidentiality','Governance','Confidentiality, secure records and data protection responsibilities.','core',['all'],12,true,false],
  ['fire-safety','Fire safety','Safety','Fire prevention, evacuation and local emergency arrangements.','core',['all'],12,true,false],
  ['equality','Equality, diversity and human rights','Care practice','Inclusive, rights-based and non-discriminatory care practice.','core',['all'],24,true,false]
];

export function workforceSetupStatements(db, organisationId, createdBy = null) {
  return [
    db.prepare('INSERT OR IGNORE INTO organisation_workforce_settings(organisation_id) VALUES(?)').bind(organisationId),
    ...DEFAULT_TRAINING.map(([key,name,category,description,level,scopes,renewal,evidence,critical]) => db.prepare('INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(`${organisationId}:training:${key}`,organisationId,name,category,description,level,JSON.stringify(scopes),renewal,evidence?1:0,critical?1:0,createdBy))
  ];
}
