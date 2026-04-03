DROP TABLE IF EXISTS dups;
CREATE TABLE dups (
  k TEXT NOT NULL,
  v TEXT
);
INSERT INTO dups VALUES ('dupkey', 'a'), ('dupkey', 'b');

DROP TABLE IF EXISTS contacts;
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT
);

INSERT INTO contacts VALUES ('c_ok', 'Alice', 'active');
INSERT INTO contacts VALUES ('c_partial', NULL, 'pending');
INSERT INTO contacts VALUES ('c_bad', 'Bob', 'wrong');
