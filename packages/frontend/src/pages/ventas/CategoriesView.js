import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchSalesByGroup } from "api/groups";
import GroupSearch from "components/GroupSearch";
import SaleReportCard from "components/Cards/SaleReport";
import ProductChart from "components/Cards/ProductGraph";
import debounce from "lodash.debounce";

const CategoriesView = ({ dateRange, showNoe, isActive }) => {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);

  const chartData = useMemo(() => {
    const dataToUse = filteredData?.length ? filteredData : data;
    if (!Array.isArray(dataToUse)) return [];
    return dataToUse.map(item => ({
      id: item.product,
      label: item.product,
      value: item.rawProfit,
      netProfit: item.netProfit,
    }));
  }, [data, filteredData]);

  const onFilter = useCallback(
    debounce((searchTerm) => {
      const filtered = data.filter(f =>
        f.product.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredData(filtered);
    }, 500),
    [data]
  );

  useEffect(() => {
    if (!isActive || !selectedGroup) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetchSalesByGroup({
          from: dateRange.from,
          to: dateRange.to,
          categoryId: selectedGroup.groupId,
          showNoe,
        });
        setData(Array.isArray(response) ? response : []);
        setFilteredData([]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange.from, dateRange.to, selectedGroup, showNoe, isActive]);

  return (
    <div>
      <div className="d-flex align-items-center mb-3 gap-3">
        <span className="text-white">Categoría</span>
        <GroupSearch onSelect={setSelectedGroup} />
      </div>
      {selectedGroup ? (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <SaleReportCard
              data={filteredData?.length ? filteredData : data}
              loading={loading}
              onFilter={onFilter}
            />
          </div>
          <div className="col-12 col-lg-6">
            <ProductChart chartData={chartData} loading={loading} />
          </div>
        </div>
      ) : (
        <div className="text-center text-muted py-5">
          Seleccione una categoría para ver las ventas
        </div>
      )}
    </div>
  );
};

export default CategoriesView;
