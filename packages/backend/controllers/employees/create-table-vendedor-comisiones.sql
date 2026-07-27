START TRANSACTION;

CREATE TABLE IF NOT EXISTS `vendedor_comisiones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `vendedorId` VARCHAR(8) NOT NULL,
  `grupoId` VARCHAR(10) NOT NULL,
  `comision` FLOAT NOT NULL,

  PRIMARY KEY (`id`),
  FOREIGN KEY (`vendedorId`) REFERENCES `vendedores`(`IdVend`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`grupoId`) REFERENCES `grupos`(`IdGrupo`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `fact_vendedor_comisiones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masterfactId` VARCHAR(12) NOT NULL,
  `grupoId` VARCHAR(10) NOT NULL,
  `comision` FLOAT NOT NULL,

  PRIMARY KEY (`id`),
  FOREIGN KEY (`masterfactId`) REFERENCES `masterfact`(`IdFactura`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`grupoId`) REFERENCES `grupos`(`IdGrupo`) ON DELETE CASCADE ON UPDATE CASCADE
);

DROP TRIGGER IF EXISTS `freeze_vendedor_comision_on_fact_insert`;

CREATE TRIGGER `freeze_vendedor_comision_on_fact_insert`
  AFTER INSERT
  ON `masterfact` FOR EACH ROW
  INSERT INTO `fact_vendedor_comisiones` (`masterfactId`, `grupoId`, `comision`)
  SELECT NEW.IdFactura, `grupoId`, `comision` FROM `vendedor_comisiones` WHERE `vendedor_comisiones`.`vendedorId` = NEW.IdVend;

COMMIT;
