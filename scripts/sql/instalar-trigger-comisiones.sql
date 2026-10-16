CREATE TRIGGER `freeze_vendedor_comision_on_fact_insert`
  AFTER INSERT
  ON `masterfact` FOR EACH ROW
  INSERT INTO `fact_vendedor_comisiones` (`masterfactId`, `grupoId`, `comision`)
  SELECT NEW.IdFactura, `grupoId`, `comision` FROM `vendedor_comisiones` WHERE `vendedor_comisiones`.`vendedorId` = NEW.IdVend;
